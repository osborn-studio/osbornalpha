import type { LineData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';
import type { KlineBar } from './kline';

/**
 * Session average price is cumulative turnover divided by cumulative volume.
 * It is only valid when every bar supplies turnover. Whitespace points split
 * sessions so a chart never draws a false overnight connection.
 */
export function computeSessionVwap(
  bars: KlineBar[],
): Array<LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>> {
  if (bars.some((bar) => bar.amount == null || bar.amount < 0)) return [];

  const out: Array<LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>> = [];
  let day = -1;
  let turnover = 0;
  let volume = 0;
  for (const bar of bars) {
    const session = Math.floor(bar.time / 86_400);
    if (session !== day) {
      if (day !== -1) out.push({ time: (bar.time - 1) as UTCTimestamp });
      day = session;
      turnover = 0;
      volume = 0;
    }
    turnover += bar.amount ?? 0;
    volume += bar.volume;
    if (volume > 0) out.push({ time: bar.time as UTCTimestamp, value: turnover / volume });
    else out.push({ time: bar.time as UTCTimestamp });
  }
  return out;
}
