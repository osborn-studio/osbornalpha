import { describe, it, expect } from 'vitest';
import { aShareMarketPhase } from './clock';
import { marketPhase, marketOfTicker } from './clock';
import { createMarketCalendar } from '@/lib/market/calendar';

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

describe('marketPhase — multi-market', () => {
  // US 夏令时（EDT, UTC-4）：2026-07-06 是周一。13:30 UTC = 09:30 EDT 开盘整点
  it('US summer (EDT): Mon 13:30 UTC → open, 390 min to close', () => {
    const r = marketPhase('US', new Date('2026-07-06T13:30:00Z'));
    expect(r.phase).toBe('open');
    expect(r.phaseKey).toBe('open');
    expect(r.minutes).toBe(390);
  });
  // US 冬令时（EST, UTC-5）：2026-01-05 是周一。13:30 UTC = 08:30 EST 盘前 60 分钟
  it('US winter (EST): Mon 13:30 UTC → pre, 60 min to open', () => {
    const r = marketPhase('US', new Date('2026-01-05T13:30:00Z'));
    expect(r.phase).toBe('pre');
    expect(r.phaseKey).toBe('pre');
    expect(r.minutes).toBe(60);
  });
  // 跨日陷阱：北京周六 09:00 = 纽约周五 21:00（EDT）→ US 是 closed 不是 weekend
  it('cross-date: Sat 01:00 UTC (Fri 21:00 NY) → US closed, not weekend', () => {
    const r = marketPhase('US', new Date('2026-07-04T01:00:00Z')); // 周六 UTC
    expect(r.phase).toBe('closed');
  });
  // 反向：北京周一 08:00 = 纽约周日 20:00 → US weekend
  it('cross-date: Mon 00:00 UTC (Sun 20:00 NY) → US weekend', () => {
    const r = marketPhase('US', new Date('2026-07-06T00:00:00Z')); // 周一 UTC = 纽约周日晚
    expect(r.phase).toBe('weekend');
  });
  // HK 午休：周一 04:30 UTC = 12:30 香港
  it('HK lunch: Mon 04:30 UTC → lunch, 30 min to afternoon open', () => {
    const r = marketPhase('HK', new Date('2026-07-06T04:30:00Z'));
    expect(r.phase).toBe('lunch');
    expect(r.phaseKey).toBe('lunch');
    expect(r.minutes).toBe(30);
  });
  // HK 下午段到 16:00：周一 07:00 UTC = 15:00 香港 → openAfternoon, 60 min
  it('HK afternoon: Mon 07:00 UTC → openAfternoon, 60 min to close', () => {
    const r = marketPhase('HK', new Date('2026-07-06T07:00:00Z'));
    expect(r.phaseKey).toBe('openAfternoon');
    expect(r.minutes).toBe(60);
  });
  // A 股经新引擎与旧函数一致
  it('A via marketPhase matches aShareMarketPhase phaseKey/minutes', () => {
    const now = new Date('2026-06-29T02:00:00Z');
    const a = marketPhase('A', now);
    expect(a.phaseKey).toBe('openMorning');
    expect(a.minutes).toBe(90);
  });

  it('uses the exchange-local date for the US Independence Day closure', () => {
    const result = marketPhase('US', new Date('2026-07-03T15:00:00Z'));
    expect(result).toEqual({ phase: 'closed', phaseKey: 'holiday' });
  });

  it('closes at 13:00 ET on the day after Thanksgiving', () => {
    expect(marketPhase('US', new Date('2026-11-27T17:59:00Z'))).toMatchObject({
      phase: 'open', phaseKey: 'open', minutes: 1,
    });
    expect(marketPhase('US', new Date('2026-11-27T18:00:00Z'))).toEqual({
      phase: 'closed', phaseKey: 'closed',
    });
  });

  it('supports injected emergency closures without changing the clock engine', () => {
    const calendar = createMarketCalendar({
      'US:2026-07-06': { kind: 'closed', name: 'Emergency closure' },
    });
    expect(marketPhase('US', new Date('2026-07-06T15:00:00Z'), calendar)).toEqual({
      phase: 'closed', phaseKey: 'holiday',
    });
  });
});

describe('marketPhase — JP/KR/TW', () => {
  // 东京周一 03:00 UTC = 12:00 JST → 午休，30 分钟后下午开盘（12:30）
  it('JP lunch: Mon 03:00 UTC → lunch, 30 min', () => {
    const r = marketPhase('JP', new Date('2026-07-06T03:00:00Z'));
    expect(r.phaseKey).toBe('lunch'); expect(r.minutes).toBe(30);
  });
  // 东京 15:30 收盘（2024-11 起）：06:00 UTC = 15:00 JST → openAfternoon, 30 min
  it('JP closes 15:30: Mon 06:00 UTC → openAfternoon, 30 min', () => {
    const r = marketPhase('JP', new Date('2026-07-06T06:00:00Z'));
    expect(r.phaseKey).toBe('openAfternoon'); expect(r.minutes).toBe(30);
  });
  // 首尔单段 09:00–15:30：周一 01:00 UTC = 10:00 KST → open
  it('KR single session: Mon 01:00 UTC → open', () => {
    const r = marketPhase('KR', new Date('2026-07-06T01:00:00Z'));
    expect(r.phaseKey).toBe('open'); expect(r.minutes).toBe(330);
  });
  // 台北单段 09:00–13:30：周一 05:00 UTC = 13:00 CST → open, 30 min
  it('TW single session: Mon 05:00 UTC → open, 30 min', () => {
    const r = marketPhase('TW', new Date('2026-07-06T05:00:00Z'));
    expect(r.phaseKey).toBe('open'); expect(r.minutes).toBe(30);
  });

  it.each([
    ['A', '2026-02-17T02:00:00Z'],
    ['HK', '2026-04-03T02:00:00Z'],
    ['JP', '2026-11-03T02:00:00Z'],
    ['KR', '2026-09-25T02:00:00Z'],
    ['TW', '2026-06-19T02:00:00Z'],
  ] as const)('%s observes its 2026 exchange holiday', (market, instant) => {
    expect(marketPhase(market, new Date(instant)).phaseKey).toBe('holiday');
  });
});

describe('marketOfTicker', () => {
  it.each([
    ['600519.SH', 'A'], ['300750.SZ', 'A'], ['830799.BJ', 'A'],
    ['0700.HK', 'HK'], ['aapl', 'US'], ['BRK.B', 'US'],
  ])('%s → %s', (t, m) => expect(marketOfTicker(t)).toBe(m));
});
