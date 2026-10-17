/** Synthetic fixture acceptance called only by the owned loopback gateway harness. */
import assert from 'node:assert/strict';
import { PostgrestClient } from '@supabase/postgrest-js';
import type { Pool } from 'pg';

export async function verifyAlertReceipts(origin: string, token: (role: string, expired?: boolean) => string, db: Pool) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  for (const key of ['RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERT_EMAIL_TO', 'EMAIL_TO', 'ALERT_EMAIL_FROM', 'EMAIL_FROM']) {
    assert(!process.env[key], 'Refusing inherited delivery configuration: ' + key);
  }
  const originalFetch = globalThis.fetch;
  let blockedExternal = 0;
  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin) { blockedExternal++; throw new Error('Acceptance prohibits external requests'); }
    const response = await originalFetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) });
    return response;
  };
  // Includes the real delivery module if a regression accidentally reaches it.
  globalThis.fetch = localFetch;
  try {
    await assert.rejects(fetch('https://synthetic-external.invalid/control'), { message: 'Acceptance prohibits external requests' });
    assert.equal(blockedExternal, 1);
    const { recordAndDeliverCheck } = await import('../../src/lib/observability/service');
    await db.query('grant select, insert, update on public.service_alert_runs to service_role; grant select, update on public.service_alert_runs to authenticated');
    const client = (role: string, fetcher = localFetch) => new PostgrestClient(origin, { headers: { Authorization: 'Bearer ' + token(role) }, fetch: fetcher });
    const admin = client('service_role');
    const input = { checkName: 'quote_15m' as const, window: { from: '2018-02-01T00:00:00Z', to: '2018-02-01T00:15:00Z' }, metrics: { batches: 12 }, violations: [] };
    const first = await recordAndDeliverCheck(admin, input);
    assert.equal(first.ok, true); assert.equal(first.deduplicated, false);
    const stored = await admin.from('service_alert_runs').select('*').eq('window_start', input.window.from).single();
    assert.equal(stored.error, null); assert(stored.data?.id);
    assert.deepEqual(stored.data.delivery, { skipped: { reason: 'healthy' } });
    const duplicate = await recordAndDeliverCheck(admin, input);
    assert.equal(duplicate.deduplicated, true); assert.deepEqual(duplicate.delivery, stored.data.delivery);
    const missing = await admin.from('service_alert_runs').update({ delivery: {} }).eq('id', '00000000-0000-0000-0000-000000000000').select('id').single();
    assert.equal(missing.status, 406); assert.equal(missing.error?.code, 'PGRST116'); assert.equal(missing.data, null);
    const user = client('authenticated');
    const hidden = await user.from('service_alert_runs').select('id').eq('id', stored.data.id);
    assert.equal(hidden.error, null); assert.deepEqual(hidden.data, []);
    const hiddenAck = await user.from('service_alert_runs').update({ delivery: {} }).eq('id', stored.data.id).select('id').single();
    assert.equal(hiddenAck.status, 406); assert.equal(hiddenAck.error?.code, 'PGRST116'); assert.equal(hiddenAck.data, null);
    // Insert as service role, but deliberately substitute valid authenticated role on the
    // actual HTTP PATCH to exercise the application's generic acknowledgement error.
    let patches = 0;
    const blindPatch: typeof fetch = (request, init) => {
      const headers = new Headers(init?.headers);
      if (init?.method === 'PATCH') { patches++; headers.set('Authorization', 'Bearer ' + token('authenticated')); }
      return localFetch(request, { ...init, headers });
    };
    const unack = { ...input, window: { from: '2018-02-01T00:15:00Z', to: '2018-02-01T00:30:00Z' } };
    await assert.rejects(recordAndDeliverCheck(client('service_role', blindPatch), unack), { message: 'service alert delivery status unavailable' });
    assert.equal(patches, 1);
    const unackStored = await admin.from('service_alert_runs').select('delivery').eq('window_start', unack.window.from).single();
    assert.equal(unackStored.error, null); assert.deepEqual(unackStored.data?.delivery, {});
    // A previously seeded unresolved alert must fail without a resend.
    const pending = { ...input, window: { from: '2018-02-01T00:30:00Z', to: '2018-02-01T00:45:00Z' }, violations: [{ code: 'synthetic_failure', value: 1, threshold: 0 }] };
    const inserted = await admin.from('service_alert_runs').insert({ check_name: pending.checkName, window_start: pending.window.from, window_end: pending.window.to, status: 'alerting', metrics: pending.metrics, violations: pending.violations, delivery: {} }).select('id').single();
    assert.equal(inserted.error, null);
    await assert.rejects(recordAndDeliverCheck(admin, pending), { message: 'service alert prior delivery unresolved' });
    const receipt = { email: { ok: false, skipped: 'not_configured' }, telegram: { ok: true, chunks_sent: 1 } };
    const ack = await admin.from('service_alert_runs').update({ delivery: receipt }).eq('id', inserted.data!.id).select('id').single();
    assert.equal(ack.error, null); assert.equal(ack.data?.id, inserted.data!.id);
    const confirmed = await recordAndDeliverCheck(admin, pending);
    assert.equal(confirmed.deduplicated, true); assert.deepEqual(confirmed.delivery, receipt);
    const freshAlert = { ...pending, window: { from: '2018-02-01T00:45:00Z', to: '2018-02-01T01:00:00Z' } };
    await assert.rejects(recordAndDeliverCheck(admin, freshAlert), { message: 'service alert delivery incomplete' });
    const freshStored = await admin.from('service_alert_runs').select('delivery').eq('window_start', freshAlert.window.from).single();
    assert.equal(freshStored.error, null);
    assert.deepEqual(freshStored.data?.delivery, { email: { ok: false, skipped: 'not_configured' }, telegram: { ok: false, skipped: 'not_configured' } });
    await assert.rejects(recordAndDeliverCheck(admin, freshAlert), { message: 'service alert prior delivery unresolved' });
    for (const [index, mode] of ['expired_jwt', 'transport_throw', 'missing_update_grant'].entries()) {
      let attempts = 0; let observedStatus: number | undefined; let observedCode: string | undefined;
      const failingPatch: typeof fetch = async (request, init) => {
        if (init?.method !== 'PATCH') return localFetch(request, init);
        attempts++;
        if (mode === 'transport_throw') throw new Error('synthetic transport detail');
        const headers = new Headers(init.headers);
        if (mode === 'expired_jwt') headers.set('Authorization', 'Bearer ' + token('service_role', true));
        else await db.query('revoke update on public.service_alert_runs from service_role');
        const response = await localFetch(request, { ...init, headers });
        observedStatus = response.status;
        observedCode = (await response.clone().json()).code;
        return response;
      };
      const start = new Date(Date.UTC(2018, 1, 1, 1, index * 15));
      const fault = { ...input, window: { from: start.toISOString(), to: new Date(start.getTime() + 900000).toISOString() } };
      try {
        await assert.rejects(recordAndDeliverCheck(client('service_role', failingPatch), fault), { message: 'service alert delivery status unavailable' });
      } finally { await db.query('grant update on public.service_alert_runs to service_role'); }
      assert.equal(attempts, 1);
      if (mode !== 'transport_throw') {
        assert.equal(observedStatus, mode === 'expired_jwt' ? 401 : 403);
        if (mode === 'expired_jwt') assert.match(observedCode!, /^PGRST3/);
        else assert.equal(observedCode, '42501');
      }
      const unchanged = await admin.from('service_alert_runs').select('delivery').eq('window_start', fault.window.from).single();
      assert.equal(unchanged.error, null); assert.deepEqual(unchanged.data?.delivery, {});
    }
    assert.equal(blockedExternal, 1);
    console.log(JSON.stringify({ alertReceiptScope: 'owned synthetic gateway with explicit fixture grants; not target privileges', healthyAck: true, duplicateReadback: true, missingRowAndRlsHidden: 'PGRST116', rlsHiddenPatchRefused: true, expiredJwtPatchRefused: true, transportPatchRefused: true, missingUpdateGrantRefused: true, freshUnconfiguredDispatchPersistedAndRefused: true, unresolvedRefused: true, manualReceiptShapeAccepted: true, noHumanDeliveryObserved: true, positiveExternalControlBlocked: 1, deliveryExternalRequests: 0 }));
  } finally { globalThis.fetch = originalFetch; }
}
