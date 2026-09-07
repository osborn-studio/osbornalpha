export type RovingTabKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End';

export function nextRovingTab<T>(
  tabs: readonly T[],
  current: T,
  key: string,
): T | null {
  if (tabs.length === 0) return null;
  const index = tabs.indexOf(current);
  if (index < 0) return null;
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs[tabs.length - 1];
  if (key === 'ArrowRight' || key === 'ArrowDown') return tabs[(index + 1) % tabs.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return tabs[(index - 1 + tabs.length) % tabs.length];
  return null;
}
