/** Load report rows (judgments ⟕ latest label) for one owner through the S4 owner transaction. */
import { transaction, type S4Actor } from '../s4/db';
import type { ReportRow } from './report';

export async function loadReportRows(actor: S4Actor, sinceIso?: string): Promise<ReportRow[]> {
  return transaction(actor, async db => {
    const rows = (await db.query(
      `select j.source_id,j.backend,j.question_id,j.selected,j.confidence,j.abstained,j.latency_ms,j.cost_micros,j.distribution,
              (select l.label from public.research_labels l where l.user_id=j.user_id and l.judgment_id=j.id order by l.labeled_at desc limit 1) as label,
              case when j.question_id in ('Q2','Q4','Q5') then exists(
                select 1 from public.research_judgments q1
                 where q1.user_id=j.user_id and q1.run_id=j.run_id and q1.source_id=j.source_id and q1.thesis_id=j.thesis_id
                   and q1.backend=j.backend and q1.question_id='Q1' and q1.abstained=false and q1.selected='true')
              else null end as gate_open
         from public.research_judgments j
        where j.user_id=$1 and ($2::timestamptz is null or j.created_at >= $2::timestamptz)
        order by j.created_at, j.id`, [actor.userId, sinceIso ?? null])).rows;
    return rows.map((r: any) => ({ source_id: r.source_id, backend: r.backend, question_id: r.question_id, selected: r.selected, confidence: r.confidence === null ? null : Number(r.confidence),
      abstained: r.abstained, latency_ms: r.latency_ms, cost_micros: r.cost_micros === null ? null : Number(r.cost_micros), distribution: r.distribution ?? {}, label: r.label ?? null, gate_open: r.gate_open === null || r.gate_open === undefined ? null : Boolean(r.gate_open) }));
  });
}
