export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { audit, requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { getPlaybookRun, PlaybookError } from '@/lib/research/playbooks';
import { getThesis } from '@/lib/research/theses';
import { getMemo } from '@/lib/research/memos';
import {
  companyIdsFor, findDuplicateItem, isRegistrable, parseRegisterBody, registrationDefaults, splitRegistration,
} from '@/lib/research/playbook-registration';
import { parseRecommendationInput, type RecommendationInput } from '@/lib/analyst/validate';
import { createRecommendations, ensurePlaybookProfile, findPlaybookProfile, listPlaybookRecommendations, toExistingPlaybookRecommendation } from '@/lib/analyst/store';

const bad = (message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: { code: 'VALIDATION_ERROR', message, ...extra } }, { status: 400 });

// Validator only needs a syntactically valid uuid here; the real analyst id is set after validation,
// so a 400 never leaves a freshly created (or un-archived) agent profile behind.
const PLACEHOLDER_ANALYST_ID = '00000000-0000-4000-8000-000000000001';
const MAX_RATIONALE = 4000;

/**
 * POST { items, rationale?, recommended_at? } → { created, skipped, analyst_id } (spec §6).
 * Order: auth → run state → validate every item (nothing written on failure) → in-batch duplicate
 * and entity checks → idempotency split → ensure the agent profile → one insert → audit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const parsed = parseRegisterBody(await req.json().catch(() => ({})));
    if (!parsed.ok) return bad(parsed.error);
    const run = await getPlaybookRun(ctx, id);
    if (!run) throw new PlaybookError('playbook run not found', 404);
    if (!isRegistrable(run)) throw new PlaybookError('run_not_registrable', 422);
    const [thesis, memo] = await Promise.all([
      run.thesis_id ? getThesis(ctx, run.thesis_id) : Promise.resolve(null),
      run.memo_id ? getMemo(ctx, run.memo_id) : Promise.resolve(null),
    ]);
    const defaults = registrationDefaults(run, thesis, memo);
    const runCompanies = new Set(companyIdsFor(thesis, memo));
    const rationale = parsed.value.rationale ?? Array.from(defaults.rationale).slice(0, MAX_RATIONALE).join('');

    const inputs: RecommendationInput[] = [];
    for (let i = 0; i < parsed.value.items.length; i++) {
      const item = parsed.value.items[i];
      if (item.entity_id !== null && !runCompanies.has(item.entity_id)) return bad('entity_not_in_run', { item_index: i, entity_id: item.entity_id });
      const candidate = parseRecommendationInput({
        analyst_id: PLACEHOLDER_ANALYST_ID,
        ticker: item.ticker,
        market: item.market,
        action: item.action,
        confidence: item.confidence ?? defaults.confidence,
        horizon: item.horizon ?? defaults.horizon ?? undefined,
        target_price: item.target_price,
        stop_loss: item.stop_loss,
        rationale,
        thesis_ref: defaults.thesis_ref ?? undefined,
        source_type: 'playbook',
        source_ref: { playbook_run_id: run.id, thesis_id: run.thesis_id ?? null, memo_id: run.memo_id ?? null, entity_id: item.entity_id, model: memo?.provenance?.model ?? null },
        recommended_at: parsed.value.recommended_at ?? defaults.recommended_at,
      });
      if (!candidate.ok) return bad(candidate.error, { item_index: i, entity_id: item.entity_id });
      inputs.push(candidate.value);
    }

    // In-batch duplicates are judged on the validator's normalized tickers (700 / 0700.HK / 00700.HK are one instrument)
    // and on repeated entity ids.
    const normalizedItems = parsed.value.items.map((item, i) => ({ ...item, ticker: inputs[i].ticker }));
    const dup = findDuplicateItem(normalizedItems);
    if (dup !== null) return bad('duplicate_item', { item_index: dup, entity_id: normalizedItems[dup].entity_id });
    const seenEntities = new Set<string>();
    for (let i = 0; i < normalizedItems.length; i++) {
      const e = normalizedItems[i].entity_id;
      if (e === null) continue;
      if (seenEntities.has(e)) return bad('duplicate_item', { item_index: i, entity_id: e });
      seenEntities.add(e);
    }

    const existing = (await listPlaybookRecommendations(run.id)).map(toExistingPlaybookRecommendation);
    const { toCreate, skipped } = splitRegistration(normalizedItems, existing);
    if (toCreate.length === 0) {
      // Nothing to write: do not create or un-archive a profile for a no-op.
      const profile = await findPlaybookProfile();
      return { created: [], skipped, analyst_id: profile?.id ?? null };
    }

    const before = await findPlaybookProfile();
    // A human profile already named "Research Playbook" blocks the agent profile; surface it as a 409 the page can show.
    const analyst = await ensurePlaybookProfile().catch((e: unknown) => {
      if (e instanceof Error && e.message === 'analyst name taken') throw new PlaybookError('analyst name taken: rename the existing “Research Playbook” profile in /analyst', 409);
      throw e;
    });
    const profileUnarchived = before !== null && before.archived_at !== null && before.id === analyst.id;

    const createSet = new Set(toCreate);
    const toInsert = inputs.filter((_, i) => createSet.has(normalizedItems[i])).map((inp) => ({ ...inp, analyst_id: analyst.id }));
    const created = await createRecommendations(toInsert);
    await audit(ctx, 'playbook.register', run.id, {
      created_ids: created.map((r) => r.id), skipped_entity_ids: skipped.map((s) => s.entity_id), analyst_id: analyst.id,
      ...(profileUnarchived ? { profile_unarchived: true } : {}),
    });
    return { created, skipped, analyst_id: analyst.id };
  });
}
