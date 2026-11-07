// src/components/company/tracking/TrackButton.tsx
// Header action (spec §5.2 "跟踪 ✓"): not watching → POST watch; watching → link to /watchlist/tracking.
// Watching state = inbox?issuerId=&limit=1 (200 / 404), not the unread-scanning GET /watches. Fails closed:
// 401 → sign-in hint, any other read failure → disabled "unavailable" (never offers a blind POST).
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { addWatch, isWatching, TrackingApiError } from '@/lib/company/tracking-client';
import { useTrackingError } from './WatchPanel';

type State = 'loading' | 'watching' | 'idle' | 'login' | 'unavailable';

export function TrackButton({ issuerId }: { issuerId: string }) {
  const t = useTranslations('tracking');
  const { show } = useToast();
  const errorText = useTrackingError();
  const [state, setState] = useState<State>('loading');
  useEffect(() => {
    let live = true;
    setState('loading');
    isWatching(issuerId)
      .then((w) => { if (live) setState(w ? 'watching' : 'idle'); })
      .catch((e) => { if (live) setState(e instanceof TrackingApiError && e.status === 401 ? 'login' : 'unavailable'); });
    return () => { live = false; };
  }, [issuerId]);
  if (state === 'watching') {
    return <Link href="/watchlist/tracking" className="inline-flex min-h-9 items-center text-sm text-accent" data-testid="track-button">{t('company.tracking')}</Link>;
  }
  return (
    <Button
      variant="secondary" size="sm" data-testid="track-button" disabled={state !== 'idle'}
      onClick={async () => {
        try { await addWatch({ issuerId }); setState('watching'); } catch (e) { show(errorText(e, 200)); }
      }}
    >
      {state === 'login' ? t('button.loginRequired') : state === 'unavailable' ? t('button.unavailable') : t('company.track')}
    </Button>
  );
}
