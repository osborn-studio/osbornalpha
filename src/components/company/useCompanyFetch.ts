// src/components/company/useCompanyFetch.ts
'use client';
// One GET per url change with abort on change/unmount and a retry nonce (plan 2026-11-06 Task 11).
import { useCallback, useEffect, useState } from 'react';
import { fetchCompanyJson, type FetchResult } from '@/lib/company/client';

export type FetchState<T> = { status: 'idle' } | { status: 'loading' } | FetchResult<T>;

export function useCompanyFetch<T>(url: string | null): { state: FetchState<T>; retry: () => void } {
  const [state, setState] = useState<FetchState<T>>(url ? { status: 'loading' } : { status: 'idle' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) { setState({ status: 'idle' }); return; }
    const ac = new AbortController();
    setState({ status: 'loading' });
    void fetchCompanyJson<T>(url, ac.signal).then((r) => { if (!ac.signal.aborted) setState(r); });
    return () => ac.abort();
  }, [url, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { state, retry };
}
