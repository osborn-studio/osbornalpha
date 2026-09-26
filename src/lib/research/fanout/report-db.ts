/** Load report rows (judgments ⟕ latest label) for one owner through the S4 owner transaction. */
import { transaction, type S4Actor } from '../s4/db';
import type { ReportRow } from './report';

export async function loadReportRows(actor: S4Actor, sinceIso?: string): Promise<ReportRow[]> {
  return transaction(actor, async db => {
    const rows = (await db.query(
      `select j.source_id,j.backend,j.question_id,j.selected,j.confidence,j.abstained,j.latency_ms,j.cost_micros,j.distribution,
              (select l.label from public.research_labels l where l.user_id=j.user_id and l.judgment_id=j.id order by l.labeled_at desc limit 1) as label
         from public.research_judgments j
        where j.user_id=$1 and ($2::timestamptz is null or j.created_at >= $2::timestamptz)
        order by j.created_at, j.id`, [actor.userId, sinceIso ?? null])).rows;
    return rows.map((r: any) => ({ source_id: r.source_id, backend: r.backend, question_id: r.question_id, selected: r.selected, confidence: r.confidence === null ? null : Number(r.confidence),
      abstained: r.abstained, latency_ms: r.latency_ms, cost_micros: r.cost_micros === null ? null : Number(r.cost_micros), distribution: r.distribution ?? {}, label: r.label ?? null }));
  });
}
