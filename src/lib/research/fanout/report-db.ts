/** Load report rows (judgments ⟕ latest label) for one owner through the S4 owner transaction. */
import { transaction, type S4Actor } from '../s4/db';
import type { ReportRow } from './report';

/** P(true) of a Q1 distribution; a false-only distribution implies its complement, like decide(). */
const pTrueOf = (d: unknown): number | null => {
  if (!d || typeof d !== 'object') return null;
  const t = (d as Record<string, unknown>).true, f = (d as Record<string, unknown>).false;
  if (typeof t === 'number') return t;
  if (typeof f === 'number') return 1 - f;
  return null;
};

export async function loadReportRows(actor: S4Actor, sinceIso?: string): Promise<ReportRow[]> {
  return transaction(actor, async db => {
    const rows = (await db.query(
      `with q1 as (
              -- One pass over the owner's Q1 rows: the latest Q1 per snapshot × backend × model × question set.
              -- A set-based join, not a correlated subquery per follow-up row, so the loader stays linear in the ledger.
              select distinct on (snapshot_id, backend, backend_model, question_set_version)
                     snapshot_id, backend, backend_model, question_set_version,
                     (abstained=false and selected='true') as gate_open, distribution as gate_distribution
                from public.research_judgments
               where user_id=$1 and question_id='Q1'
               order by snapshot_id, backend, backend_model, question_set_version, created_at desc, id desc)
       select j.source_id,j.backend,j.question_id,j.selected,j.confidence,j.abstained,j.latency_ms,j.cost_micros,j.distribution,j.question_set_version,j.backend_model,
              (select l.label from public.research_labels l where l.user_id=j.user_id and l.judgment_id=j.id order by l.labeled_at desc limit 1) as label,
              -- The gate is the Q1 judgment of the same snapshot (source, thesis, entity-table versions),
              -- backend, model and question set — not the same run: retries reuse content-addressed Q1 rows.
              case when j.question_id in ('Q2','Q4','Q5') then coalesce(q1.gate_open, false) else null end as gate_open,
              case when j.question_id in ('Q2','Q4','Q5') then q1.gate_distribution else null end as gate_distribution
         from public.research_judgments j
         left join q1 on q1.snapshot_id=j.snapshot_id and q1.backend=j.backend and q1.backend_model=j.backend_model
                     and q1.question_set_version=j.question_set_version and j.question_id in ('Q2','Q4','Q5')
        where j.user_id=$1 and ($2::timestamptz is null or j.created_at >= $2::timestamptz)
        order by j.created_at, j.id`, [actor.userId, sinceIso ?? null])).rows;
    return rows.map((r: any) => ({ source_id: r.source_id, backend: r.backend, question_id: r.question_id, selected: r.selected, confidence: r.confidence === null ? null : Number(r.confidence),
      abstained: r.abstained, latency_ms: r.latency_ms, cost_micros: r.cost_micros === null ? null : Number(r.cost_micros), distribution: r.distribution ?? {}, label: r.label ?? null, gate_open: r.gate_open === null || r.gate_open === undefined ? null : Boolean(r.gate_open),
      gate_p_true: pTrueOf(r.gate_distribution), question_set_version: r.question_set_version ?? null, backend_model: r.backend_model ?? null }));
  });
}
