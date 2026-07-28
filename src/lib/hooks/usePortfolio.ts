'use client';

// Cockpit data plumbing: /api/portfolio + /api/decisions readers with refetch,
// and post helpers for decisions/trades. Same minimal-fetch style as useBatchQuotes.

import { useCallback, useEffect, useState } from 'react';
import type { Decision, DecisionStatus, Position, Trade } from '@/lib/supabase/database.types';

export interface PortfolioData {
  positions: Position[];
  totals: { realized_pnl: number; open_count: number };
}

export function usePortfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `http ${res.status}`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

export function useDecisions(opts: { ticker?: string; status?: DecisionStatus } = {}) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const { ticker, status } = opts;

  const refetch = useCallback(async () => {
    const qs = new URLSearchParams();
    if (ticker) qs.set('ticker', ticker);
    if (status) qs.set('status', status);
    try {
      const res = await fetch(`/api/decisions${qs.size ? `?${qs}` : ''}`);
      const j = await res.json();
      if (res.ok) setDecisions(j.decisions ?? []);
    } finally {
      setLoading(false);
    }
  }, [ticker, status]);

  useEffect(() => { refetch(); }, [refetch]);
  return { decisions, loading, refetch };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `http ${res.status}`);
  return j as T;
}

export function postDecision(input: Record<string, unknown>) {
  return postJson<{ decision: Decision }>('/api/decisions', input);
}
export function postTrade(input: Record<string, unknown>) {
  return postJson<{ trade: Trade }>('/api/trades', input);
}
