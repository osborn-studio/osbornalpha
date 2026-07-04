import { requireResearchUser } from '@/lib/research/store';
import { checkMemoAxioms, hasBlockingFailure, type MemoForCheck } from '@/lib/research/axioms';
import { loadAxioms } from '@/lib/research/memos';
import { listSourcesByIds } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Ad-hoc axiom check: POST a memo draft (spec §7.7 POST /api/axioms/check). */
export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const memo: MemoForCheck = {
      one_line_conclusion: body.one_line_conclusion ?? '',
      thesis: body.thesis ?? '',
      supporting_evidence: Array.isArray(body.supporting_evidence) ? body.supporting_evidence : [],
      counter_arguments: Array.isArray(body.counter_arguments) ? body.counter_arguments : [],
      invalidation_conditions: Array.isArray(body.invalidation_conditions) ? body.invalidation_conditions : [],
      confidence: body.confidence ?? 'LOW',
    };
    const axioms = await loadAxioms(ctx);
    const citedIds = new Set<string>();
    for (const ev of [...memo.supporting_evidence, ...memo.counter_arguments]) {
      for (const id of ev.source_document_ids ?? []) citedIds.add(id);
    }
    const sources = await listSourcesByIds(ctx, [...citedIds]);
    const results = checkMemoAxioms(memo, sources, axioms);
    return { results, blocked: hasBlockingFailure(results) };
  });
}
