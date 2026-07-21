import type { AlertViolation, AlertWindow } from './evaluators';
import { dispatchOperationalAlert } from './delivery';

export interface AlertDb {
  from(table: string): any;
}

interface RecordCheckInput {
  checkName: 'ai_daily' | 'quote_15m' | 'auth_email_daily';
  window: AlertWindow;
  metrics: Record<string, unknown>;
  violations: AlertViolation[];
}

export async function recordAndDeliverCheck(db: AlertDb, input: RecordCheckInput) {
  const status = input.violations.length > 0 ? 'alerting' : 'healthy';
  const { data, error } = await db.from('service_alert_runs').insert({
    check_name: input.checkName,
    window_start: input.window.from,
    window_end: input.window.to,
    status,
    metrics: input.metrics,
    violations: input.violations,
    delivery: {},
  }).select('id').single();

  if (error?.code === '23505') {
    return { ok: true, deduplicated: true, status, metrics: input.metrics, violations: input.violations };
  }
  if (error || !data?.id) throw new Error('service alert run unavailable');

  const delivery = input.violations.length > 0
    ? await dispatchOperationalAlert(input)
    : { skipped: { reason: 'healthy' } };
  const update = await db.from('service_alert_runs').update({ delivery }).eq('id', data.id);
  if (update.error) throw new Error('service alert delivery status unavailable');

  return {
    ok: true,
    deduplicated: false,
    status,
    metrics: input.metrics,
    violations: input.violations,
    delivery,
  };
}
