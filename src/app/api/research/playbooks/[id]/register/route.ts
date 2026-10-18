export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { audit, requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { getPlaybookRun, PlaybookError } from '@/lib/research/playbooks';
import { getThesis } from '@/lib/research/theses';
import { getMemo } from '@/lib/research/memos';
import {
  findDuplicateItem, isRegistrable, parseRegisterBody, registrationDefaults, splitRegistration,
} from '@/lib/research/playbook-registration';
import { parseRecommendationInput, type RecommendationInput } from '@/lib/analyst/validate';
import { createRecommendations, ensurePlaybookProfile, listPlaybookRecommendations, toExistingPlaybookRecommendation } from '@/lib/analyst/store';

const bad = (message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: { code: 'VALIDATION_ERROR', message, ...extra } }, { status: 400 });

/**
 * POST { items, rationale?, recommended_at? } → { created, skipped, analyst_id } (spec §6).
 * Every item is validated with the analyst validator before anything is written;
 * already-registered items are skipped; the rest are inserted in one request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseRegisterBody(await req.json().catch(() => ({})));
  if (!parsed.ok) return bad(parsed.error);
  const dup = findDuplicateItem(parsed.value.items);
  if (dup !== null) return bad('duplicate_item', { item_index: dup });

  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const run = await getPlaybookRun(ctx, id);
    if (!run) throw new PlaybookError('playbook run not found', 404);
    if (!isRegistrable(run)) throw new PlaybookError('run_not_registrable', 422);
    const [thesis, memo] = await Promise.all([
      run.thesis_id ? getThesis(ctx, run.thesis_id) : Promise.resolve(null),
      run.memo_id ? getMemo(ctx, run.memo_id) : Promise.resolve(null),
    ]);
    const defaults = registrationDefaults(run, thesis, memo);
    // A human profile already named "Research Playbook" blocks the agent profile; surface it as a 409 the page can show.
    const analyst = await ensurePlaybookProfile().catch((e: unknown) => {
      if (e instanceof Error && e.message === 'analyst name taken') throw new PlaybookError('analyst name taken: rename the existing “Research Playbook” profile in /analyst', 409);
      throw e;
    });

    const items = parsed.value.items;
    const inputs: RecommendationInput[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const candidate = parseRecommendationInput({
        analyst_id: analyst.id,
        ticker: item.ticker,
        market: item.market,
        action: item.action,
        confidence: item.confidence ?? defaults.confidence,
        horizon: item.horizon ?? defaults.horizon ?? undefined,
        target_price: item.target_price,
        stop_loss: item.stop_loss,
        rationale: parsed.value.rationale ?? defaults.rationale,
        thesis_ref: defaults.thesis_ref ?? undefined,
        source_type: 'playbook',
        source_ref: { playbook_run_id: run.id, thesis_id: run.thesis_id ?? null, memo_id: run.memo_id ?? null, entity_id: item.entity_id, model: memo?.provenance?.model ?? null },
        recommended_at: parsed.value.recommended_at ?? defaults.recommended_at,
      });
      if (!candidate.ok) return bad(candidate.error, { item_index: i, entity_id: item.entity_id });
      inputs.push(candidate.value);
    }

    const existing = (await listPlaybookRecommendations(run.id)).map(toExistingPlaybookRecommendation);
    const { toCreate, skipped } = splitRegistration(items, existing);
    // splitRegistration returns the same item objects, and inputs is index-aligned with items:
    // select by identity so the validator's ticker normalization (0700.HK → 00700.HK) cannot desync the two sides.
    const createSet = new Set(toCreate);
    const created = await createRecommendations(inputs.filter((_, i) => createSet.has(items[i])));
    await audit(ctx, 'playbook.register', run.id, {
      created_ids: created.map((r) => r.id), skipped_entity_ids: skipped.map((s) => s.entity_id), analyst_id: analyst.id,
    });
    return { created, skipped, analyst_id: analyst.id };
  });
}
