import { describe, it, expect } from 'vitest';
import { aShareMarketPhase } from './clock';

// All fixed instants below are UTC Date objects; Beijing time = UTC+8.
// e.g. Monday 01:00 UTC = Monday 09:00 Beijing.

describe('aShareMarketPhase', () => {
  it('pre-market: weekday 09:00 Beijing → pre, 30 min to open', () => {
    // Monday 2026-06-29 01:00 UTC = Monday 09:00 Beijing
    const now = new Date('2026-06-29T01:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('pre');
    expect(r.label).toBe('盘前 · A股开盘还有 30 分钟');
    expect(r.phaseKey).toBe('pre');
    expect(r.minutes).toBe(30);
  });

  it('open (morning session): weekday 10:00 Beijing → open, 90 min to lunch', () => {
    // Monday 2026-06-29 02:00 UTC = Monday 10:00 Beijing
    const now = new Date('2026-06-29T02:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('open');
    expect(r.label).toBe('盘中 · 午休还有 90 分钟');
    expect(r.phaseKey).toBe('openMorning');
    expect(r.minutes).toBe(90);
  });

  it('lunch: weekday 12:00 Beijing → lunch, 60 min to afternoon open', () => {
    // Monday 2026-06-29 04:00 UTC = Monday 12:00 Beijing
    const now = new Date('2026-06-29T04:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('lunch');
    expect(r.label).toBe('午休 · 下午开盘还有 60 分钟');
    expect(r.phaseKey).toBe('lunch');
    expect(r.minutes).toBe(60);
  });

  it('open (afternoon session): weekday 14:00 Beijing → open, 60 min to close', () => {
    // Monday 2026-06-29 06:00 UTC = Monday 14:00 Beijing
    const now = new Date('2026-06-29T06:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('open');
    expect(r.label).toBe('盘中 · 收盘还有 60 分钟');
    expect(r.phaseKey).toBe('openAfternoon');
    expect(r.minutes).toBe(60);
  });

  it('closed: weekday 16:00 Beijing → closed', () => {
    // Monday 2026-06-29 08:00 UTC = Monday 16:00 Beijing
    const now = new Date('2026-06-29T08:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('closed');
    expect(r.label).toBe('已收盘');
    expect(r.phaseKey).toBe('closed');
    expect(r.minutes).toBeUndefined();
  });

  it('weekend: Saturday → weekend regardless of hour', () => {
    // Saturday 2026-07-04 03:00 UTC = Saturday 11:00 Beijing
    const now = new Date('2026-07-04T03:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('weekend');
    expect(r.label).toBe('周末休市');
    expect(r.phaseKey).toBe('weekend');
    expect(r.minutes).toBeUndefined();
  });

  it('weekend: Sunday → weekend', () => {
    // Sunday 2026-07-05 03:00 UTC = Sunday 11:00 Beijing
    const now = new Date('2026-07-05T03:00:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('weekend');
    expect(r.phaseKey).toBe('weekend');
  });

  it('boundary: exactly 09:30 Beijing → open, 120 min to lunch', () => {
    // Monday 2026-06-29 01:30 UTC = Monday 09:30 Beijing
    const now = new Date('2026-06-29T01:30:00Z');
    const r = aShareMarketPhase(now);
    expect(r.phase).toBe('open');
    expect(r.label).toBe('盘中 · 午休还有 120 分钟');
    expect(r.phaseKey).toBe('openMorning');
    expect(r.minutes).toBe(120);
  });
});
