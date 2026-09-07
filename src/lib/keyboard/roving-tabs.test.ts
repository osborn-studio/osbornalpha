import { describe, expect, it } from 'vitest';
import { nextRovingTab } from './roving-tabs';

describe('nextRovingTab', () => {
  const tabs = ['summary', 'chart', 'research'] as const;

  it('moves in both orientations and wraps at each edge', () => {
    expect(nextRovingTab(tabs, 'summary', 'ArrowRight')).toBe('chart');
    expect(nextRovingTab(tabs, 'summary', 'ArrowDown')).toBe('chart');
    expect(nextRovingTab(tabs, 'summary', 'ArrowLeft')).toBe('research');
    expect(nextRovingTab(tabs, 'research', 'ArrowUp')).toBe('chart');
  });

  it('supports Home and End while ignoring unrelated keys', () => {
    expect(nextRovingTab(tabs, 'chart', 'Home')).toBe('summary');
    expect(nextRovingTab(tabs, 'chart', 'End')).toBe('research');
    expect(nextRovingTab(tabs, 'chart', 'Enter')).toBeNull();
  });
});
