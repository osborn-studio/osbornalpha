export const dynamic = 'force-dynamic';

import { requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { getPlaybookRun, PlaybookError } from '@/lib/research/playbooks';
import { getThesis } from '@/lib/research/theses';
import { getMemo } from '@/lib/research/memos';
import { listEntities } from '@/lib/research/entities';
import {
  buildRegistrationCandidates, companyIdsFor, isRegistrable, registrationDefaults, type SecurityRow,
} from '@/lib/research/playbook-registration';
import { findPlaybookProfile, listPlaybookRecommendations, toExistingPlaybookRecommendation } from '@/lib/analyst/store';

/**
 * GET → RegistrationView (spec §5): everything the inline form needs to register
 * an approved PAPER_TRADE run as analyst recommendations, plus what was already
 * registered from it. Research reads analyst rows only to show that status.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const run = await getPlaybookRun(ctx, id);
    if (!run) throw new PlaybookError('playbook run not found', 404);
    const [thesis, memo] = await Promise.all([
      run.thesis_id ? getThesis(ctx, run.thesis_id) : Promise.resolve(null),
      run.memo_id ? getMemo(ctx, run.memo_id) : Promise.resolve(null),
    ]);
    const companyIds = companyIdsFor(thesis, memo);
    const [entities, securities, existingRows, analyst] = await Promise.all([
      companyIds.length ? listEntities(ctx, { type: 'COMPANY' }) : Promise.resolve([]),
      companyIds.length ? loadSecurities(ctx, companyIds) : Promise.resolve([] as SecurityRow[]),
      listPlaybookRecommendations(run.id),
      findPlaybookProfile(),
    ]);
    const existing = existingRows.map(toExistingPlaybookRecommendation);
    return {
      run: { id: run.id, proposed_action: run.proposed_action, approval_status: run.approval_status, rationale: run.rationale, review_at: run.review_at ?? null, thesis_id: run.thesis_id ?? null, memo_id: run.memo_id ?? null },
      source_title: thesis?.title ?? memo?.title ?? '',
      defaults: registrationDefaults(run, thesis, memo),
      candidates: buildRegistrationCandidates(entities, companyIds, securities, existing),
      analyst: analyst ? { id: analyst.id, display_name: analyst.display_name } : null,
      registered_count: existing.length,
      registrable: isRegistrable(run),
    };
  });
}

async function loadSecurities(ctx: Awaited<ReturnType<typeof requireResearchUser>>, entityIds: string[]): Promise<SecurityRow[]> {
  const { data, error } = await ctx.supabase.from('research_entity_securities')
    .select('entity_id, exchange_code, market, is_primary, valid_to').eq('user_id', ctx.userId).in('entity_id', entityIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    entity_id: String(s.entity_id), exchange_code: String(s.exchange_code), market: String(s.market),
    is_primary: Boolean(s.is_primary), valid_to: s.valid_to ? String(s.valid_to) : null,
  }));
}
