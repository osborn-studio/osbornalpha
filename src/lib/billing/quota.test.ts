import { describe, it, expect } from 'vitest';
import { dayWindowUtc8, limitFor } from './quota';

// All fixed instants below are UTC Date objects; Beijing (Asia/Shanghai, UTC+8)
// time = UTC + 8h. e.g. 2026-07-02T16:00:00Z = 2026-07-03T00:00:00+08:00.

describe('dayWindowUtc8', () => {
  it('23:59 Beijing on 07-02 still belongs to the 07-02 Beijing day', () => {
    // 2026-07-02 23:59 Beijing = 2026-07-02 15:59 UTC
    const now = new Date('2026-07-02T15:59:00Z');
    const { startIso, endIso } = dayWindowUtc8(now);
    // Beijing day [2026-07-02T00:00+08, 2026-07-03T00:00+08) in UTC:
    expect(startIso).toBe('2026-07-01T16:00:00.000Z');
    expect(endIso).toBe('2026-07-02T16:00:00.000Z');
  });

  it('00:01 Beijing on 07-03 belongs to the 07-03 Beijing day (rolled over)', () => {
    // 2026-07-03 00:01 Beijing = 2026-07-02 16:01 UTC
    const now = new Date('2026-07-02T16:01:00Z');
    const { startIso, endIso } = dayWindowUtc8(now);
    expect(startIso).toBe('2026-07-02T16:00:00.000Z');
    expect(endIso).toBe('2026-07-03T16:00:00.000Z');
  });

  it('exact midnight Beijing (00:00:00) starts a new day window', () => {
    // 2026-07-03 00:00:00 Beijing = 2026-07-02 16:00:00 UTC
    const now = new Date('2026-07-02T16:00:00Z');
    const { startIso, endIso } = dayWindowUtc8(now);
    expect(startIso).toBe('2026-07-02T16:00:00.000Z');
    expect(endIso).toBe('2026-07-03T16:00:00.000Z');
  });

  it('one millisecond before midnight Beijing still belongs to the prior day', () => {
    // 2026-07-02 23:59:59.999 Beijing = 2026-07-02 15:59:59.999 UTC
    const now = new Date('2026-07-02T15:59:59.999Z');
    const { startIso, endIso } = dayWindowUtc8(now);
    expect(startIso).toBe('2026-07-01T16:00:00.000Z');
    expect(endIso).toBe('2026-07-02T16:00:00.000Z');
  });

  it('window width is always exactly 24 hours', () => {
    const now = new Date('2026-07-02T15:59:00Z');
    const { startIso, endIso } = dayWindowUtc8(now);
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    expect(ms).toBe(24 * 60 * 60 * 1000);
  });
});

describe('limitFor', () => {
  it('free plan: copilot=20, perspectives=5, brief_preview=2', () => {
    expect(limitFor('copilot', 'free', 'user')).toBe(20);
    expect(limitFor('perspectives', 'free', 'user')).toBe(5);
    expect(limitFor('brief_preview', 'free', 'user')).toBe(2);
  });

  it('pro plan: copilot=100, perspectives=50, brief_preview=20', () => {
    expect(limitFor('copilot', 'pro', 'user')).toBe(100);
    expect(limitFor('perspectives', 'pro', 'user')).toBe(50);
    expect(limitFor('brief_preview', 'pro', 'user')).toBe(20);
  });

  it('admin role: unlimited (-1) regardless of plan', () => {
    expect(limitFor('copilot', 'free', 'admin')).toBe(-1);
    expect(limitFor('perspectives', 'pro', 'admin')).toBe(-1);
    expect(limitFor('brief_preview', null, 'admin')).toBe(-1);
  });

  it('null plan falls back to free limits', () => {
    expect(limitFor('copilot', null, 'user')).toBe(20);
    expect(limitFor('perspectives', null, null)).toBe(5);
  });

  it('unknown plan string falls back to free limits', () => {
    expect(limitFor('brief_preview', 'enterprise', 'user')).toBe(2);
    expect(limitFor('copilot', 'unknown', null)).toBe(20);
  });
});
