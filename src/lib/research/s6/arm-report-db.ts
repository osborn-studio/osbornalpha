/** Load ledger decisions with the latest S6 evaluation of their observation, through the owner transaction. */
import { transaction, type S4Actor } from '../s4/db';
import { fail } from '../ingest/pa-v1/json.js';
import type { ArmRow } from './arm-report';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export async function loadArmRows(actor: S4Actor, opts: { since?: string } = {}): Promise<ArmRow[]> {
  if (opts.since !== undefined && !(ISO_DATE.test(opts.since) && Number.isFinite(Date.parse(opts.since)))) fail('invalid_schema');
  return transaction(actor, async db => {
    const rows = (await db.query(
      `select d.id as decision_id,d.thesis_id,d.week_of,d.arm,d.action,d.observation_id,
              (select e.result from public.research_s6_evaluations e where e.user_id=d.user_id and e.observation_id=d.observation_id
                 order by (e.receipt->>'revision')::int desc nulls last,e.created_at desc limit 1) as evaluation
         from public.research_decisions d
        where d.user_id=$1 and ($2::date is null or d.week_of >= $2::date)
        order by d.week_of,d.arm,d.created_at,d.id`, [actor.userId, opts.since ?? null])).rows;
    return rows.map((r: any) => ({ decision_id: r.decision_id, thesis_id: r.thesis_id, week_of: r.week_of instanceof Date ? r.week_of.toISOString().slice(0, 10) : String(r.week_of), arm: r.arm, action: r.action,
      observation_id: r.observation_id ?? null, evaluation: r.evaluation && typeof r.evaluation === 'object' ? { status: r.evaluation.status, windows: Array.isArray(r.evaluation.windows) ? r.evaluation.windows : [] } : null }));
  });
}
