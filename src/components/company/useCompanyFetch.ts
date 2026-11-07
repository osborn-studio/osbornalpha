'use client';
// One GET per url change with abort on change/unmount and a retry nonce (plan 2026-11-06 Task 11).
// The result is stored with its url: a different current url reads as loading before any effect runs.
import { useCallback, useEffect, useState } from 'react';
import { fetchCompanyJson } from '@/lib/company/client';
import { stateFor, type FetchState, type Stored } from '@/lib/company/fetch-state';

export type { FetchState };

export function useCompanyFetch<T>(url: string | null): { state: FetchState<T>; retry: () => void } {
  const [stored, setStored] = useState<Stored<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    void fetchCompanyJson<T>(url, ac.signal).then((result) => { if (!ac.signal.aborted) setStored({ url, result }); });
    return () => ac.abort();
  }, [url, nonce]);
  const retry = useCallback(() => { setStored(null); setNonce((n) => n + 1); }, []);
  return { state: stateFor(url, stored), retry };
}
