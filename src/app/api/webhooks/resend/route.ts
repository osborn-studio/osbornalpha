import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  classifyAuthEmailSubject,
  emailDeliveryStatus,
  hashProbeRecipient,
  mergeDeliveryState,
  parseProbeTargets,
  type EmailDeliveryState,
} from '@/lib/observability/auth-email';

export const dynamic = 'force-dynamic';

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    subject?: string;
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const hashSecret = process.env.OBSERVABILITY_HASH_SECRET;
  if (!webhookSecret || !hashSecret) {
    return NextResponse.json({ error: 'Webhook unavailable' }, { status: 503 });
  }

  const payload = await request.text();
  let event: ResendEvent;
  try {
    event = new Webhook(webhookSecret).verify(payload, {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    }) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const svixId = request.headers.get('svix-id');
  const occurredAt = event.created_at;
  const category = classifyAuthEmailSubject(event.data?.subject ?? '');
  const incomingStatus = emailDeliveryStatus(event.type ?? '');
  if (!svixId || !occurredAt || !category || !incomingStatus) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const configuredTargets = new Set(
    parseProbeTargets(process.env.AUTH_EMAIL_PROBE_TARGETS).map((target) => target.email),
  );
  const recipients = (event.data?.to ?? [])
    .map((email) => email.trim().toLowerCase())
    .filter((email) => configuredTargets.has(email));
  if (recipients.length === 0) return NextResponse.json({ ok: true, ignored: true });

  try {
    const admin = getAdminSupabase();
    let processed = 0;
    for (const email of recipients) {
      const recipientHash = hashProbeRecipient(email, hashSecret);
      const inserted = await (admin.from('resend_webhook_events') as any).insert({
        svix_id: svixId,
        recipient_hash: recipientHash,
        email_id: event.data?.email_id ?? null,
        event_type: event.type,
        category,
        occurred_at: occurredAt,
      });
      if (inserted.error?.code === '23505') continue;
      if (inserted.error) throw new Error('webhook event unavailable');

      const runResult = await (admin.from('auth_email_probe_runs') as any)
        .select('id,signup_delivery,signup_delivery_at,recovery_delivery,recovery_delivery_at')
        .eq('recipient_hash', recipientHash)
        .lte(category === 'signup' ? 'signup_requested_at' : 'recovery_requested_at', occurredAt)
        .order('probe_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runResult.error) throw new Error('probe run lookup unavailable');
      if (!runResult.data) continue;

      const statusKey = `${category}_delivery` as 'signup_delivery' | 'recovery_delivery';
      const atKey = `${category}_delivery_at` as 'signup_delivery_at' | 'recovery_delivery_at';
      const merged = mergeDeliveryState(
        {
          status: runResult.data[statusKey] as EmailDeliveryState,
          at: runResult.data[atKey] as string | null,
        },
        { status: incomingStatus, at: occurredAt },
      );
      const updated = await (admin.from('auth_email_probe_runs') as any)
        .update({ [statusKey]: merged.status, [atKey]: merged.at })
        .eq('id', runResult.data.id);
      if (updated.error) throw new Error('probe delivery update unavailable');
      processed += 1;
    }
    return NextResponse.json({ ok: true, processed });
  } catch {
    console.error('Resend webhook storage failed');
    return NextResponse.json({ error: 'Webhook storage unavailable' }, { status: 500 });
  }
}
