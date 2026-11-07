// src/components/company/tracking/TrackButton.tsx
'use client';
// Header track toggle against the tracking API (plan 2026-11-06 Task 11 → Task 16 routes; spec §6.2).
// Fails closed: 404 (routes not deployed) disables the button; watch_limit shows the fixed message.
// Placeholder: Task 17 overwrites this file (same export TrackButton({issuerId}), same data-testid).
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { fetchCompanyJson, trackStateOf, type TrackState } from '@/lib/company/client';
import { useToast } from '@/components/Toast';

export function TrackButton({ issuerId }: { issuerId: string }) {
  const t = useTranslations('tracking.button');
  const { show } = useToast();
  const [state, setState] = useState<TrackState>('loading');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    void fetchCompanyJson<{ watches?: { issuerId?: unknown }[] }>('/api/tracking/watches', ac.signal)
      .then((r) => { if (!ac.signal.aborted) setState(trackStateOf(r, issuerId)); });
    return () => ac.abort();
  }, [issuerId]);

  async function toggle() {
    if (busy || (state !== 'tracked' && state !== 'untracked')) return;
    setBusy(true);
    try {
      const res = state === 'tracked'
        ? await fetch(`/api/tracking/watches/${encodeURIComponent(issuerId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
        : await fetch('/api/tracking/watches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issuerId }) });
      if (res.ok) { setState(state === 'tracked' ? 'untracked' : 'tracked'); return; }
      const body = await res.json().catch(() => null) as { error?: { code?: string } } | null;
      show(body?.error?.code === 'watch_limit' ? t('limit') : t('error'));
    } catch {
      show(t('error'));
    } finally {
      setBusy(false);
    }
  }

  const label = state === 'tracked' ? t('tracking') : state === 'login' ? t('loginRequired') : state === 'unavailable' ? t('unavailable') : t('track');
  return (
    <Button
      variant="secondary" size="sm" onClick={toggle} aria-pressed={state === 'tracked'} data-testid="track-button"
      disabled={busy || state === 'loading' || state === 'login' || state === 'unavailable'}
      className={state === 'tracked' ? 'border-[var(--border-active)] text-[var(--accent)]' : undefined}
    >
      {label}
    </Button>
  );
}
