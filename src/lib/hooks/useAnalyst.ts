'use client';

// Fetch helpers for the analyst pages. Same minimal style as usePortfolio.ts:
// plain fetch, `{ error }` body on failure, typed results.

import type { AnalystProfile, Recommendation } from '@/lib/supabase/database.types';
import type { Book, BookSummary } from '@/lib/analyst/book';
import type { RecommendationView } from '@/lib/analyst/store';

export type ProfileWithSummary = AnalystProfile & { summary: BookSummary };
export type { RecommendationView, Book, BookSummary };

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `http ${res.status}`);
  return j as T;
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export const fetchProfiles = () => fetch('/api/analyst/profiles').then((r) => json<{ profiles: ProfileWithSummary[] }>(r));
export const createProfile = (body: Record<string, unknown>) => post('/api/analyst/profiles', body).then((r) => json<{ profile: AnalystProfile }>(r));
export const patchProfile = (id: string, body: { display_name?: string; note?: string | null; archived?: boolean }) =>
  fetch(`/api/analyst/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => json<{ profile: AnalystProfile }>(r));

export const fetchRecommendations = (q: { analyst?: string; ticker?: string; open?: boolean } = {}) => {
  const qs = new URLSearchParams();
  if (q.analyst) qs.set('analyst', q.analyst);
  if (q.ticker) qs.set('ticker', q.ticker);
  if (q.open) qs.set('open', '1');
  return fetch(`/api/analyst/recommendations${qs.size ? `?${qs}` : ''}`).then((r) => json<{ recommendations: RecommendationView[] }>(r));
};
export const createRecommendation = (body: Record<string, unknown>) =>
  post('/api/analyst/recommendations', body).then((r) => json<{ recommendation: Recommendation }>(r));
export const withdrawRecommendation = (id: string, reason?: string) =>
  post(`/api/analyst/recommendations/${encodeURIComponent(id)}/withdraw`, { reason }).then((r) => json<{ recommendation: Recommendation }>(r));

export const fetchBook = (analyst: string) =>
  fetch(`/api/analyst/book?analyst=${encodeURIComponent(analyst)}`).then((r) => json<{ profile: AnalystProfile; book: Book }>(r));
export const refreshScores = () => post('/api/analyst/scores').then((r) => json<{ scored: number; skipped: number }>(r));
