'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WatchlistAlert, WatchlistAlertEvent, WatchlistAlertWithOrigin } from '@/lib/supabase/database.types';
import { watchlistJsonRequest } from '@/lib/watchlist/api-client';

export interface NewWatchlistAlert {
  alertType: WatchlistAlert['alert_type'];
  operator?: WatchlistAlert['operator'];
  threshold?: number | null;
  config?: Record<string, unknown>;
  cooldownMinutes?: number;
}

export function useWatchlistAlerts(itemId: string | null) {
  const [alerts, setAlerts] = useState<WatchlistAlertWithOrigin[]>([]);
  const [events, setEvents] = useState<WatchlistAlertEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const query = encodeURIComponent(itemId);
      const [alertBody, eventBody] = await Promise.all([
        watchlistJsonRequest<{ alerts: WatchlistAlertWithOrigin[] }>(`/api/watchlist/alerts?itemId=${query}`, { signal, cache: 'no-store' }, 'watchlist_alert_request_failed'),
        watchlistJsonRequest<{ events: WatchlistAlertEvent[] }>(`/api/watchlist/alert-events?itemId=${query}&limit=20`, { signal, cache: 'no-store' }, 'watchlist_alert_request_failed'),
      ]);
      setAlerts(alertBody.alerts);
      setEvents(eventBody.events);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'watchlist_alert_request_failed');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const create = useCallback(async (input: NewWatchlistAlert) => {
    if (!itemId) return false;
    setSaving(true);
    setError(null);
    try {
      const body = await watchlistJsonRequest<{ alert: WatchlistAlert }>('/api/watchlist/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, ...input }),
      }, 'watchlist_alert_request_failed');
      setAlerts((current) => [{ ...body.alert, origin: null }, ...current]);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'watchlist_alert_request_failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, [itemId]);

  const update = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const body = await watchlistJsonRequest<{ alert: WatchlistAlert }>(`/api/watchlist/alerts/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      }, 'watchlist_alert_request_failed');
      setAlerts((current) => current.map((alert) => alert.id === id ? { ...body.alert, origin: alert.origin } : alert));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'watchlist_alert_request_failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await watchlistJsonRequest(`/api/watchlist/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'watchlist_alert_request_failed');
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'watchlist_alert_request_failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const body = await watchlistJsonRequest<{ event: WatchlistAlertEvent }>(`/api/watchlist/alert-events/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: true }),
    }, 'watchlist_alert_request_failed');
    setEvents((current) => current.map((event) => event.id === id ? body.event : event));
  }, []);

  const retryDelivery = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const body = await watchlistJsonRequest<{ event: WatchlistAlertEvent }>(`/api/watchlist/alert-events/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retry: true }),
      }, 'watchlist_alert_request_failed');
      setEvents((current) => current.map((event) => event.id === id ? body.event : event));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'watchlist_alert_request_failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { alerts, events, loading, saving, error, create, update, remove, markRead, retryDelivery, refetch: () => load() };
}
