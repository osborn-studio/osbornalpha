/** Shared default window for Watchlist headline research aggregates. */
export const WATCHLIST_RESEARCH_WINDOW_DAYS = 14;

export function researchWindowCutoff(now: Date, days = WATCHLIST_RESEARCH_WINDOW_DAYS): Date {
  const boundedDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : WATCHLIST_RESEARCH_WINDOW_DAYS;
  return new Date(now.getTime() - boundedDays * 24 * 60 * 60 * 1000);
}
