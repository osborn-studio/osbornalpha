import { assertEnabled, getDb } from '@/lib/research/db';
import { checkMemoAxioms, hasBlockingFailure, type MemoForCheck } from '@/lib/research/axioms';
import { withResearch } from '@/lib/research/api';
import { readJson, type Axiom, type SourceDocument } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

function loadAxioms(db: ReturnType<typeof getDb>): Axiom[] {
  return db.prepare(`select * from axioms order by code asc`).all().map((row: any) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    severity: row.severity,
    enabled: !!row.enabled,
    created_at: row.created_at,
  }));
}

/** Ad-hoc axiom check: POST a memo draft (spec §7.7 POST /api/axioms/check). */
export async function POST(req: Request) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const memo: MemoForCheck = {
      one_line_conclusion: body.one_line_conclusion ?? '',
      thesis: body.thesis ?? '',
      supporting_evidence: Array.isArray(body.supporting_evidence) ? body.supporting_evidence : [],
      counter_arguments: Array.isArray(body.counter_arguments) ? body.counter_arguments : [],
      invalidation_conditions: Array.isArray(body.invalidation_conditions) ? body.invalidation_conditions : [],
      confidence: body.confidence ?? 'LOW',
    };
    const db = getDb();
    const axioms = loadAxioms(db);
    const citedIds = new Set<string>();
    for (const ev of [...memo.supporting_evidence, ...memo.counter_arguments]) {
      for (const id of ev.source_document_ids ?? []) citedIds.add(id);
    }
    const sources: SourceDocument[] = [];
    for (const id of citedIds) {
      const row = db.prepare(`select * from source_documents where id = ?`).get(id);
      if (row) {
        sources.push({ ...row, entity_ids: readJson<string[]>(row.entity_ids, []) });
      }
    }
    const results = checkMemoAxioms(memo, sources, axioms);
    return { results, blocked: hasBlockingFailure(results) };
  });
}
