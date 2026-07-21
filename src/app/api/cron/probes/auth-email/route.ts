import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import {
  beijingDate,
  evaluateAuthEmailProbes,
  hashProbeRecipient,
  parseProbeTargets,
  type ProbeResultSample,
} from '@/lib/observability/auth-email';
import { previousBeijingDayWindow } from '@/lib/observability/evaluators';
import { recordAndDeliverCheck } from '@/lib/observability/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ProbeFlow = 'signup' | 'recovery';
const AUTH_USERS_PAGE_SIZE = 1_000;

function configuredFlow(value: string | null): ProbeFlow | null {
  return value === 'signup' || value === 'recovery' ? value : null;
}

async function loadUsersByEmail(admin: ReturnType<typeof getAdminSupabase>) {
  const usersByEmail = new Map<string, Awaited<ReturnType<typeof admin.auth.admin.listUsers>>['data']['users'][number]>();
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: AUTH_USERS_PAGE_SIZE });
    if (result.error) throw new Error('auth probe users unavailable');
    for (const user of result.data.users) {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), user);
    }
    if (result.data.users.length < AUTH_USERS_PAGE_SIZE) return usersByEmail;
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron unavailable' }, { status: 503 });
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const flow = configuredFlow(new URL(request.url).searchParams.get('flow'));
  if (!flow) return NextResponse.json({ error: 'Invalid probe flow' }, { status: 400 });

  const targets = parseProbeTargets(process.env.AUTH_EMAIL_PROBE_TARGETS);
  const password = process.env.AUTH_EMAIL_PROBE_PASSWORD;
  const hashSecret = process.env.OBSERVABILITY_HASH_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (targets.length < 2 || !password || password.length < 16 || !hashSecret || !supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Auth email probe unavailable' }, { status: 503 });
  }

  try {
    const now = new Date();
    const today = beijingDate(now);
    const admin = getAdminSupabase();
    let priorCheck: Record<string, unknown> | null = null;

    if (flow === 'recovery') {
      const previousWindow = previousBeijingDayWindow(now);
      const previousDate = beijingDate(new Date(new Date(previousWindow.from).getTime() + 60_000));
      const previous = await (admin.from('auth_email_probe_runs') as any)
        .select('domain,signup_delivery,recovery_delivery')
        .eq('probe_date', previousDate)
        .limit(20);
      if (previous.error) throw new Error('previous auth probe unavailable');
      const priorChecks = await (admin.from('service_alert_runs') as any)
        .select('id')
        .eq('check_name', 'auth_email_daily')
        .limit(1);
      if (priorChecks.error) throw new Error('previous auth probe check unavailable');
      const bootstrap = (previous.data ?? []).length === 0 && (priorChecks.data ?? []).length === 0;
      const evaluation = evaluateAuthEmailProbes(
        (previous.data ?? []) as ProbeResultSample[],
        targets.length,
        bootstrap,
      );
      priorCheck = await recordAndDeliverCheck(admin, {
        checkName: 'auth_email_daily',
        window: previousWindow,
        ...evaluation,
      });
    }

    const auth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const usersByEmail = await loadUsersByEmail(admin);

    const outcomes: Array<{ domain: string; requested: boolean }> = [];
    for (const target of targets) {
      const recipientHash = hashProbeRecipient(target.email, hashSecret);
      const timestamp = now.toISOString();
      const pendingRow = {
        recipient_hash: recipientHash,
        domain: target.domain,
        probe_date: today,
        updated_at: timestamp,
        ...(flow === 'signup'
          ? { signup_requested_at: timestamp, signup_delivery: 'pending' }
          : { recovery_requested_at: timestamp, recovery_delivery: 'pending' }),
      };
      const pending = await (admin.from('auth_email_probe_runs') as any).upsert(pendingRow, {
        onConflict: 'recipient_hash,probe_date',
      });
      if (pending.error) throw new Error('auth probe pending result unavailable');

      let requested = false;
      if (flow === 'signup') {
        let existing = usersByEmail.get(target.email);
        const confirmed = Boolean(existing?.email_confirmed_at ?? existing?.confirmed_at);
        const synthetic = existing?.app_metadata?.synthetic_auth_probe === true;
        if (existing && confirmed && synthetic) {
          const deletion = await admin.auth.admin.deleteUser(existing.id);
          if (deletion.error) throw new Error('synthetic probe recycle unavailable');
          existing = undefined;
        }
        if (existing && confirmed && !synthetic) {
          throw new Error('probe target belongs to a non-synthetic account');
        }
        if (existing) {
          const result = await auth.auth.resend({
            type: 'signup',
            email: target.email,
            options: { emailRedirectTo: 'https://osbornalpha.com/auth/callback?probe=1' },
          });
          requested = !result.error;
        } else {
          const result = await auth.auth.signUp({
            email: target.email,
            password,
            options: { emailRedirectTo: 'https://osbornalpha.com/auth/callback?probe=1' },
          });
          requested = !result.error;
          if (result.data.user?.id) {
            const tagged = await admin.auth.admin.updateUserById(result.data.user.id, {
              app_metadata: { synthetic_auth_probe: true },
            });
            if (tagged.error) throw new Error('synthetic probe tagging unavailable');
          }
        }
      } else {
        const result = await auth.auth.resetPasswordForEmail(target.email, {
          redirectTo: 'https://osbornalpha.com/reset-password?probe=1',
        });
        requested = !result.error;
      }

      if (!requested) {
        const statusKey = flow === 'signup' ? 'signup_delivery' : 'recovery_delivery';
        const stored = await (admin.from('auth_email_probe_runs') as any)
          .update({ [statusKey]: 'failed', updated_at: new Date().toISOString() })
          .eq('recipient_hash', recipientHash)
          .eq('probe_date', today);
        if (stored.error) throw new Error('auth probe failure result unavailable');
      }
      outcomes.push({ domain: target.domain, requested });
    }

    return NextResponse.json({
      ok: outcomes.every((outcome) => outcome.requested),
      flow,
      probe_date: today,
      targets: outcomes,
      prior_check: priorCheck,
    });
  } catch {
    console.error('auth email synthetic probe failed');
    return NextResponse.json({ error: 'auth email probe failed' }, { status: 500 });
  }
}
