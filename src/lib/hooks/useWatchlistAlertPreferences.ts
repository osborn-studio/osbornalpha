'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WatchlistAlertDeliveryPreferences } from '@/lib/watchlist/alert-delivery-preferences';
import type { WatchlistAlertPreferencesCommand } from '@/lib/watchlist/alert-preferences';
import { watchlistJsonRequest } from '@/lib/watchlist/api-client';

async function request<T>(init?: RequestInit): Promise<T> {
  return watchlistJsonRequest<T>('/api/watchlist/alert-preferences', init, 'watchlist_alert_preferences_failed');
}

export function useWatchlistAlertPreferences() {
  const [preferences, setPreferences] = useState<WatchlistAlertDeliveryPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request<{ preferences: WatchlistAlertDeliveryPreferences }>({ signal: controller.signal, cache: 'no-store' })
      .then((body) => setPreferences(body.preferences))
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'watchlist_alert_preferences_failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const save = useCallback(async (command: WatchlistAlertPreferencesCommand) => {
    setSaving(true); setError(null);
    try {
      const body = await request<{ preferences: WatchlistAlertDeliveryPreferences }>({
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
      });
      setPreferences(body.preferences); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'watchlist_alert_preferences_failed'); return false; }
    finally { setSaving(false); }
  }, []);
  return { preferences, loading, saving, error, save };
}
