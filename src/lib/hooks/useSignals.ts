'use client';

import { useEffect, useState } from 'react';

export interface SignalEvent {
  date: string;
  close: number;
  triggers: Array<{ rule: string; desc: string; weight: number }>;
  total_score: number;
  forward_1d_pct: number | null;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  hit_5d: 'hit' | 'miss' | 'flat' | 'pending';
  bias: 'bull' | 'bear' | 'neutral';
}

export interface SignalsState {
  events: SignalEvent[];
  stats: {
    total_signals: number;
    bull_signals: number;
    bear_signals: number;
    neutral_signals: number;
    hits_5d: number;
    misses_5d: number;
    flats_5d: number;
    hit_rate_5d: number;
    avg_forward_5d_pct: number;
    avg_forward_20d_pct: number;
    best?: { date: string; forward_5d_pct: number; triggers: string[] };
    worst?: { date: string; forward_5d_pct: number; triggers: string[] };
  } | null;
  loading: boolean;
  error: string | null;
  source: string | null;
}

export function useSignals(ticker: string | null, days = 60): SignalsState {
  const [state, setState] = useState<SignalsState>({
    events: [], stats: null, loading: !!ticker, error: null, source: null,
  });

  useEffect(() => {
    if (!ticker) { setState({ events: [], stats: null, loading: false, error: null, source: null }); return; }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetch(`/api/signals/${encodeURIComponent(ticker)}?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setState({ events: [], stats: null, loading: false, error: data.error, source: null });
          return;
        }
        setState({
          events: data.events || [],
          stats: data.stats || null,
          loading: false,
          error: null,
          source: data.source || null,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ events: [], stats: null, loading: false, error: err?.message || '获取失败', source: null });
      });
    return () => { cancelled = true; };
  }, [ticker, days]);

  return state;
}
