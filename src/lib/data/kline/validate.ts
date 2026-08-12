import {
  KlineProviderError,
  type KlineAdjustment,
  type SourceKlineBar,
  type SourceKlineSeries,
} from './types';

const SOURCE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

function sameBar(a: SourceKlineBar, b: SourceKlineBar): boolean {
  return a.time === b.time
    && a.open === b.open
    && a.high === b.high
    && a.low === b.low
    && a.close === b.close
    && a.volume === b.volume;
}

function assertValidBar(bar: SourceKlineBar): void {
  if (!SOURCE_TIME_RE.test(bar.time)) {
    throw new KlineProviderError('invalid_data', `Invalid K-line time: ${bar.time}`);
  }
  const [datePart, timePart] = bar.time.split(/[ T]/);
  const [year, month, day] = datePart.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
    throw new KlineProviderError('invalid_data', `Invalid K-line calendar date: ${bar.time}`);
  }
  if (timePart) {
    const [hour, minute, second = 0] = timePart.split(':').map(Number);
    if (hour > 23 || minute > 59 || second > 59) {
      throw new KlineProviderError('invalid_data', `Invalid K-line clock time: ${bar.time}`);
    }
  }
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (prices.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new KlineProviderError('invalid_data', `Invalid OHLC values at ${bar.time}`);
  }
  if (!Number.isFinite(bar.volume) || bar.volume < 0) {
    throw new KlineProviderError('invalid_data', `Invalid volume at ${bar.time}`);
  }
  if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.high < bar.low) {
    throw new KlineProviderError('invalid_data', `Invalid OHLC relationship at ${bar.time}`);
  }
}

export interface ValidatedKlineSeries extends SourceKlineSeries {
  completeness: 'complete' | 'partial';
}

export function validateKlineSeries(
  series: SourceKlineSeries,
  expectedAdjustment: KlineAdjustment,
  limit: number,
): ValidatedKlineSeries {
  if (series.adjustment !== expectedAdjustment) {
    throw new KlineProviderError(
      'invalid_data',
      `Adjustment mismatch: expected ${expectedAdjustment}, got ${series.adjustment}`,
    );
  }

  const sorted = [...series.bars].sort((a, b) => a.time.localeCompare(b.time));
  const unique: SourceKlineBar[] = [];
  for (const bar of sorted) {
    assertValidBar(bar);
    const previous = unique[unique.length - 1];
    if (previous?.time === bar.time) {
      if (!sameBar(previous, bar)) {
        throw new KlineProviderError('invalid_data', `Conflicting duplicate K-line at ${bar.time}`);
      }
      continue;
    }
    unique.push(bar);
  }

  if (unique.length === 0) {
    throw new KlineProviderError('empty', 'Provider returned no usable K-line bars');
  }

  const bars = unique.slice(-limit);
  return {
    ...series,
    bars,
    completeness: bars.length >= limit ? 'complete' : 'partial',
  };
}

export function assertCompatibleSeries(
  candidate: SourceKlineSeries,
  previous: SourceKlineSeries,
): void {
  if (candidate.adjustment !== previous.adjustment) {
    throw new KlineProviderError('invalid_data', 'Cannot compare series with different adjustment modes');
  }

  const previousByTime = new Map(previous.bars.map((bar) => [bar.time, bar]));
  const overlaps = candidate.bars
    .map((bar) => ({ candidate: bar, previous: previousByTime.get(bar.time) }))
    .filter((item): item is { candidate: SourceKlineBar; previous: SourceKlineBar } => !!item.previous)
    .slice(-20);
  if (overlaps.length < 5) return;

  let priceConflicts = 0;
  let volumeConflicts = 0;
  for (const { candidate: next, previous: old } of overlaps) {
    const priceBase = Math.max(Math.abs(old.close), 1e-9);
    if (Math.abs(next.close - old.close) / priceBase > 0.03) priceConflicts += 1;
    if (next.volume > 0 && old.volume > 0) {
      const ratio = Math.max(next.volume, old.volume) / Math.min(next.volume, old.volume);
      if (ratio > 20) volumeConflicts += 1;
    }
  }

  const allowedConflicts = Math.max(1, Math.floor(overlaps.length * 0.2));
  if (priceConflicts > allowedConflicts || volumeConflicts > allowedConflicts) {
    throw new KlineProviderError('invalid_data', 'Fallback series conflicts with the last-known-good series');
  }
}
