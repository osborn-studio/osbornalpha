/**
 * Signal backtest engine.
 *
 * Approach: replay the same trigger rules used in brief composer against
 * historical K-line bars. For each day where signals fire, score what
 * happens N days later (1d / 5d / 20d forward returns).
 *
 * Output: signal timeline + win-rate stats + best/worst examples.
 *
 * This is deterministic (no LLM cost), purely arithmetic over K-line.
 */

import { fetchEastmoneyKline, type KlineBar } from '@/lib/data/sources/eastmoney';

export interface SignalEvent {
  date: string;             // YYYY-MM-DD
  close: number;
  triggers: Array<{ rule: string; desc: string; weight: number }>;
  total_score: number;
  /** Forward return: close[i+N] / close[i] - 1, in % */
  forward_1d_pct: number | null;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  /** Whether the bullish vs bearish bias was correct over the next 5 days */
  hit_5d: 'hit' | 'miss' | 'flat' | 'pending';
  /** Direction implied by the signal */
  bias: 'bull' | 'bear' | 'neutral';
}

export interface BacktestResult {
  source: string;
  ticker: string;
  bars_examined: number;
  events: SignalEvent[];
  stats: {
    total_signals: number;
    bull_signals: number;
    bear_signals: number;
    neutral_signals: number;
    hits_5d: number;
    misses_5d: number;
    flats_5d: number;
    hit_rate_5d: number;   // 0..1, ignoring pending
    avg_forward_5d_pct: number;
    avg_forward_20d_pct: number;
    best?: { date: string; forward_5d_pct: number; triggers: string[] };
    worst?: { date: string; forward_5d_pct: number; triggers: string[] };
  };
  duration_ms: number;
}

interface RollingFeatures {
  vol5: number;        // 5-day rolling avg volume
  vol20: number;
  pctChg: number;
  amplitude: number;   // (high-low)/prev_close
  consecUpDays: number;
  rsi14: number | null;
}

function computeFeatures(bars: KlineBar[], i: number): RollingFeatures | null {
  if (i < 14) return null;
  const bar = bars[i];
  const prev = bars[i - 1];

  // Rolling volumes
  const sumLast = (n: number) => {
    let s = 0;
    for (let k = i - n; k < i; k++) s += bars[k].volume;
    return s / n;
  };
  const vol5 = sumLast(5);
  const vol20 = sumLast(20);

  // Daily change
  const pctChg = ((bar.close - prev.close) / prev.close) * 100;
  const amplitude = ((bar.high - bar.low) / prev.close) * 100;

  // Consecutive up days
  let consecUp = 0;
  for (let k = i; k >= 1 && bars[k].close > bars[k - 1].close; k--) consecUp++;

  // RSI 14
  let gains = 0, losses = 0;
  for (let k = i - 13; k <= i; k++) {
    const ch = bars[k].close - bars[k - 1].close;
    if (ch > 0) gains += ch; else losses -= ch;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  const rsi14 = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  return { vol5, vol20, pctChg, amplitude, consecUpDays: consecUp, rsi14 };
}

function detectTriggers(
  bar: KlineBar,
  feat: RollingFeatures
): { triggers: SignalEvent['triggers']; bias: SignalEvent['bias'] } {
  const triggers: SignalEvent['triggers'] = [];
  let bullScore = 0, bearScore = 0;

  // Large single-day move
  if (Math.abs(feat.pctChg) >= 5) {
    triggers.push({ rule: 'large_move', desc: `单日 ${feat.pctChg >= 0 ? '+' : ''}${feat.pctChg.toFixed(2)}%`, weight: 3 });
    if (feat.pctChg >= 5) bullScore += 3; else bearScore += 3;
  } else if (Math.abs(feat.pctChg) >= 3) {
    triggers.push({ rule: 'medium_move', desc: `单日 ${feat.pctChg >= 0 ? '+' : ''}${feat.pctChg.toFixed(2)}%`, weight: 2 });
    if (feat.pctChg >= 3) bullScore += 1; else bearScore += 1;
  }

  // Volume spike vs 5-day avg
  if (feat.vol5 > 0 && bar.volume / feat.vol5 >= 2.5) {
    const ratio = bar.volume / feat.vol5;
    triggers.push({ rule: 'anomalous_volume', desc: `量比 ${ratio.toFixed(2)}x`, weight: 2 });
    // Volume spike on up day = bull, on down day = bear
    if (bar.close >= bar.open) bullScore += 1; else bearScore += 1;
  }

  // High amplitude (volatility spike)
  if (feat.amplitude >= 5) {
    triggers.push({ rule: 'high_amplitude', desc: `振幅 ${feat.amplitude.toFixed(2)}%`, weight: 1 });
  }

  // RSI extremes
  if (feat.rsi14 !== null) {
    if (feat.rsi14 >= 75) {
      triggers.push({ rule: 'rsi_overbought', desc: `RSI ${feat.rsi14.toFixed(0)} 超买`, weight: 2 });
      bearScore += 2;
    } else if (feat.rsi14 <= 25) {
      triggers.push({ rule: 'rsi_oversold', desc: `RSI ${feat.rsi14.toFixed(0)} 超卖`, weight: 2 });
      bullScore += 2;
    }
  }

  // Multi-day momentum
  if (feat.consecUpDays >= 5) {
    triggers.push({ rule: 'momentum_up', desc: `${feat.consecUpDays} 连阳`, weight: 1 });
    bullScore += 1;
  }

  const bias: SignalEvent['bias'] =
    bullScore > bearScore + 1 ? 'bull' :
    bearScore > bullScore + 1 ? 'bear' : 'neutral';

  return { triggers, bias };
}

function classifyHit(bias: SignalEvent['bias'], fwdPct: number | null): SignalEvent['hit_5d'] {
  if (fwdPct === null) return 'pending';
  if (bias === 'neutral') return 'flat';
  const threshold = 1.5;
  if (Math.abs(fwdPct) < threshold) return 'flat';
  const wentUp = fwdPct > 0;
  if (bias === 'bull' && wentUp) return 'hit';
  if (bias === 'bear' && !wentUp) return 'hit';
  return 'miss';
}

function forwardPct(bars: KlineBar[], i: number, n: number): number | null {
  if (i + n >= bars.length) return null;
  const base = bars[i].close;
  const future = bars[i + n].close;
  return ((future - base) / base) * 100;
}

export async function runBacktest(ticker: string, lookbackDays = 60): Promise<BacktestResult> {
  const startedAt = Date.now();
  const result = await fetchEastmoneyKline(ticker, 'D', Math.max(lookbackDays + 25, 90));
  if (!result || result.bars.length === 0) {
    return {
      source: 'eastmoney',
      ticker,
      bars_examined: 0,
      events: [],
      stats: {
        total_signals: 0, bull_signals: 0, bear_signals: 0, neutral_signals: 0,
        hits_5d: 0, misses_5d: 0, flats_5d: 0, hit_rate_5d: 0,
        avg_forward_5d_pct: 0, avg_forward_20d_pct: 0,
      },
      duration_ms: Date.now() - startedAt,
    };
  }

  const bars = result.bars;
  const events: SignalEvent[] = [];

  // Walk through bars after warmup (need 14 days for RSI + 5 for vol)
  for (let i = Math.max(14, bars.length - lookbackDays); i < bars.length; i++) {
    const feat = computeFeatures(bars, i);
    if (!feat) continue;

    const { triggers, bias } = detectTriggers(bars[i], feat);
    if (triggers.length === 0) continue;  // no signal that day

    const fwd1 = forwardPct(bars, i, 1);
    const fwd5 = forwardPct(bars, i, 5);
    const fwd20 = forwardPct(bars, i, 20);
    const hit_5d = classifyHit(bias, fwd5);

    events.push({
      date: bars[i].time,
      close: bars[i].close,
      triggers,
      total_score: triggers.reduce((s, t) => s + t.weight, 0),
      forward_1d_pct: fwd1,
      forward_5d_pct: fwd5,
      forward_20d_pct: fwd20,
      hit_5d,
      bias,
    });
  }

  // Stats
  const decided = events.filter((e) => e.hit_5d !== 'pending');
  const hits = decided.filter((e) => e.hit_5d === 'hit').length;
  const misses = decided.filter((e) => e.hit_5d === 'miss').length;
  const flats = decided.filter((e) => e.hit_5d === 'flat').length;
  const hit_rate_5d = hits + misses === 0 ? 0 : hits / (hits + misses);

  const fwd5Valid = events.filter((e) => e.forward_5d_pct !== null);
  const fwd20Valid = events.filter((e) => e.forward_20d_pct !== null);
  const avg_forward_5d_pct = fwd5Valid.length === 0 ? 0 :
    fwd5Valid.reduce((s, e) => s + (e.forward_5d_pct as number), 0) / fwd5Valid.length;
  const avg_forward_20d_pct = fwd20Valid.length === 0 ? 0 :
    fwd20Valid.reduce((s, e) => s + (e.forward_20d_pct as number), 0) / fwd20Valid.length;

  // Best / worst by forward 5d
  const decidedWithFwd = events.filter((e) => e.forward_5d_pct !== null);
  const sorted = decidedWithFwd.slice().sort((a, b) => (b.forward_5d_pct as number) - (a.forward_5d_pct as number));
  const best = sorted[0] ? { date: sorted[0].date, forward_5d_pct: sorted[0].forward_5d_pct as number, triggers: sorted[0].triggers.map((t) => t.desc) } : undefined;
  const worst = sorted[sorted.length - 1] ? { date: sorted[sorted.length - 1].date, forward_5d_pct: sorted[sorted.length - 1].forward_5d_pct as number, triggers: sorted[sorted.length - 1].triggers.map((t) => t.desc) } : undefined;

  return {
    source: 'eastmoney+backtest',
    ticker,
    bars_examined: bars.length,
    events,
    stats: {
      total_signals: events.length,
      bull_signals: events.filter((e) => e.bias === 'bull').length,
      bear_signals: events.filter((e) => e.bias === 'bear').length,
      neutral_signals: events.filter((e) => e.bias === 'neutral').length,
      hits_5d: hits,
      misses_5d: misses,
      flats_5d: flats,
      hit_rate_5d,
      avg_forward_5d_pct,
      avg_forward_20d_pct,
      best,
      worst,
    },
    duration_ms: Date.now() - startedAt,
  };
}
