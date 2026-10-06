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

function recordedDeliverySucceeded(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const channels = Object.entries(value);
  if (channels.length === 0 || channels.some(([name]) => !['email', 'telegram'].includes(name))) return false;
  let success = false;
  for (const [, channel] of channels) {
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) return false;
    const receipt = channel as Record<string, unknown>;
    if (receipt.ok === true) success = true;
    else if (receipt.ok !== false || receipt.skipped !== 'not_configured') return false;
  }
  return success;
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
    // A unique insert only proves that a run exists, not that it was delivered.
    const stored = await db.from('service_alert_runs')
      .select('id,status,metrics,violations,delivery')
      .eq('check_name', input.checkName).eq('window_start', input.window.from)
      .eq('window_end', input.window.to).maybeSingle();
    const row = stored.data;
    if (stored.error || !row?.id || !['healthy', 'alerting'].includes(row.status)
      || !row.metrics || typeof row.metrics !== 'object' || Array.isArray(row.metrics)
      || !Array.isArray(row.violations)
      || (row.status === 'alerting') !== (row.violations.length > 0)) throw new Error('service alert prior run unavailable');
    if (row.status === 'alerting' && !recordedDeliverySucceeded(row.delivery)) {
      // Do not automatically resend an uncertain externally delivered message.
      throw new Error('service alert prior delivery unresolved');
    }
    return { ok: true, deduplicated: true, status: row.status, metrics: row.metrics,
      violations: row.violations, delivery: row.delivery };
  }
  if (error || !data?.id) throw new Error('service alert run unavailable');

  let delivery: Record<string, Record<string, unknown>> = { skipped: { reason: 'healthy' } };
  if (input.violations.length > 0) {
    try { delivery = await dispatchOperationalAlert(input); }
    catch { delivery = { dispatch: { ok: false, error_code: 'alert_dispatch_threw' } }; }
  }
  try {
    const update = await db.from('service_alert_runs').update({ delivery }).eq('id', data.id).select('id').single();
    if (update.error || update.data?.id !== data.id) throw new Error('Receipt acknowledgement failed');
  } catch {
    // Client/transport exceptions must not expose their raw message either.
    throw new Error('service alert delivery status unavailable');
  }
  if (status === 'alerting' && !recordedDeliverySucceeded(delivery)) {
    throw new Error('service alert delivery incomplete');
  }

  return {
    ok: true,
    deduplicated: false,
    status,
    metrics: input.metrics,
    violations: input.violations,
    delivery,
  };
}
