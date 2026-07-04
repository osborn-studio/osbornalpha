'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

interface UsageResp {
  plan_effective: string;
  plan_expires_at: string | null;
}

type CheckoutMode = 'pass' | 'subscription';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Settings page "升级 Pro" card (id="upgrade" so QuotaNotice can deep-link
// here via /settings#upgrade). Reads /api/usage/today for the current
// effective plan + expiry, offers two Stripe Checkout entry points (one-time
// 30-day pass vs. monthly auto-renewing subscription), and shows a success
// banner when redirected back with ?upgraded=1.
export function UpgradeCard() {
  const t = useTranslations('components.upgradeCard');
  const { show } = useToast();
  const [data, setData] = useState<UsageResp | null>(null);
  const [busy, setBusy] = useState<CheckoutMode | null>(null);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    setJustUpgraded(new URLSearchParams(window.location.search).get('upgraded') === '1');
    fetch('/api/usage/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, [configured]);

  async function checkout(mode: CheckoutMode) {
    setBusy(mode);
    try {
      const resp = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body.url) {
        show(`✗ ${body.error || t('checkoutFailed')}`);
        setBusy(null);
        return;
      }
      window.location.href = body.url;
    } catch (e: any) {
      show(`✗ ${e?.message || t('checkoutFailed')}`);
      setBusy(null);
    }
  }

  if (!configured) return null;

  const isPro = data?.plan_effective === 'pro';

  return (
    <div id="upgrade" className="space-y-3 text-sm">
      {justUpgraded && (
        <div className="rounded-md border border-up/40 bg-up/10 px-3 py-2 text-xs text-up">
          ✅ {t('upgradeSuccess')}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">
            {t('currentPlan')}：{isPro ? 'Pro' : 'Free'}
          </div>
          {isPro && data?.plan_expires_at && (
            <div className="mt-0.5 text-[11px] text-text-dim">{t('expiresOn')}：{formatDate(data.plan_expires_at)}</div>
          )}
          {isPro && !data?.plan_expires_at && (
            <div className="mt-0.5 text-[11px] text-text-dim">{t('autoRenewing')}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={() => checkout('pass')}
          disabled={busy !== null}
          className="rounded-md bg-bg-card border border-border px-3 py-2 text-left text-xs disabled:opacity-50"
        >
          <div className="font-semibold">{t('timePass30d')}</div>
          <div className="mt-0.5 text-text-dim">{t('timePassDescription')}</div>
          {busy === 'pass' && <div className="mt-1 text-accent-dim">{t('redirectingToCheckout')}</div>}
        </button>
        <button
          onClick={() => checkout('subscription')}
          disabled={busy !== null}
          className="rounded-md bg-accent-dim px-3 py-2 text-left text-xs text-white disabled:opacity-50"
        >
          <div className="font-semibold">{t('monthlySubscription')}</div>
          <div className="mt-0.5 opacity-90">{t('monthlySubscriptionDescription')}</div>
          {busy === 'subscription' && <div className="mt-1">{t('redirectingToCheckout')}</div>}
        </button>
      </div>
    </div>
  );
}
