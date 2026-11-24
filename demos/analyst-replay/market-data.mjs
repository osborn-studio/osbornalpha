// Read completed sessions on the production analyst price basis. Persist the returned
// window with the individual registration so its PM audit survives a service restart.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveScoringKline } from '../../src/lib/data/kline/reliability.ts';
import { validateKlineSeries } from '../../src/lib/data/kline/validate.ts';
import { fetchScoringBars } from '../../src/lib/scoring/daily-bars.ts';
import { exchangeDate } from '../../src/lib/scoring/forward.ts';
import { normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';
import { FINAL_SCORING_DAY } from './demo-score.mjs';
import { fetchReplayGatewayHistory } from './datagateway.mjs';
import { classifyMarket, currencyCodeOfMarket } from '../../src/lib/utils.ts';

const file = readFileSync(new URL('./tencent-hk00700.json', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
if (sha(file) !== '41c4929d2e45ec32bcb2d5997fc3e54f07f39dc7595c983d3d2148991d1302a0') {
  throw new Error('演示行情快照校验失败。');
}
const frozen = JSON.parse(file);
const sourceNames = { tencent:'腾讯财经', sina:'新浪财经', eastmoney:'东方财富', datagateway:'DataGateway' };
const failure = (code, message, status = 503) => Object.assign(new Error(message), {code, status});

function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstWeekday(date) {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return shiftDate(date, weekday === 6 ? 2 : weekday === 0 ? 1 : 0);
}

function sliceWindow(ticker, market, date, series, mode) {
  if (!series.bars.length) throw failure('price_unavailable', '行情接口未返回已收盘日线。');
  // A truncated series must never silently move an old call forward to its first bar.
  if (series.bars[0].time > firstWeekday(date)) {
    throw failure('before_window', '行情未覆盖建议日，无法确认模拟成交价。', 422);
  }
  const start = series.bars.findIndex(bar => bar.time >= date);
  const bars = start < 0 ? [] : series.bars.slice(start, start + FINAL_SCORING_DAY + 1).map(({ time, close }) => ({ time, close }));
  const { source, adjustment, fetchedAt } = series;
  const snapshotId = sha(JSON.stringify([FINAL_SCORING_DAY, ticker, market, date, source, adjustment, bars]));
  return {
    ticker, market, name: ticker === frozen.ticker ? frozen.name : ticker, currency: currencyCodeOfMarket(market),
    source: sourceNames[source] ?? source, mode, adjustment: adjustment === 'qfq' ? '前复权' : '不复权',
    fetchedAt, snapshotId, availableThrough:series.bars.at(-1).time,
    baseDate:bars[0]?.time ?? null, d5Date:bars[5]?.time ?? null, d10Date:bars[FINAL_SCORING_DAY]?.time ?? null, bars,
  };
}

async function fromGateway(ticker, market, date, now) {
  const adjustment = market === 'A' ? 'qfq' : 'none';
  const today = exchangeDate(now.toISOString(), market);
  const end = shiftDate(date, 100);
  const series = await fetchReplayGatewayHistory({
    ticker, market, limit:160, adjustment,
    startDate:shiftDate(date, -40), endDate:end < today ? end : today,
  });
  if (!series) return null;
  return { ...validateKlineSeries(series, adjustment, 160), freshness:'fresh', fetchedAt:now.toISOString() };
}

async function fromResolution(ticker, market, date, resolve) {
  let series;
  const result = await fetchScoringBars([ticker], async request => {
    series = await resolve(request);
    if (!series || series.adjustment !== (market === 'A' ? 'qfq' : 'none')) {
      throw failure('price_unavailable', '行情复权口径无法确认。');
    }
    return series;
  });
  const completed = result.get(ticker);
  if (!completed?.length) throw failure('price_unavailable', '行情接口未返回可核验的已收盘日线。');
  // These three equity markets have no weekend sessions. A provider's non-trading
  // placeholder must not advance the T+5/T+10 index.
  if (completed.some(bar => {
    const day = new Date(bar.time + 'T00:00:00Z').getUTCDay();
    return !Number.isFinite(day) || day === 0 || day === 6;
  })) throw failure('price_unavailable', '行情接口返回了非交易日记录。');
  return sliceWindow(ticker, market, date, {...series, bars:completed}, 'provider');
}

function fromSnapshot(ticker, market, date) {
  if (ticker !== frozen.ticker || market !== frozen.market || date > frozen.cutoff || firstWeekday(date) < frozen.bars[0][0]) return null;
  return sliceWindow(ticker, market, date, {
    source:frozen.source, adjustment:'none', fetchedAt:frozen.retrievedAt,
    bars:frozen.bars.map(([time, close]) => ({time, close})),
  }, 'snapshot');
}

export function createMarketWindowLoader({
  resolve = resolveScoringKline, gateway = fromGateway, now = Date.now, timeoutMs = 32_000,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  async function read(ticker, market, date) {
    let best = null;
    let readError;
    // The authenticated gateway may serve windows older than the public 1y route.
    // Never splice prices from two providers, including when one only has T+5.
    const routes = [
      () => gateway(ticker, market, date, new Date(now())),
      resolve,
    ];
    let timer;
    let expired = false;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(failure('price_unavailable', '行情接口请求超时。')); }, timeoutMs);
    });
    try {
      for (const route of routes) {
        try {
          const result = await Promise.race([fromResolution(ticker, market, date, route), deadline]);
          if (result.d10Date) return result;
          if (!best || result.bars.length > best.bars.length) best = result;
        } catch (err) {
          if (!readError || err.code === 'before_window') readError = err;
          if (expired) break;
        }
      }
    } finally {
      clearTimeout(timer);
    }
    const snapshot = fromSnapshot(ticker, market, date);
    if (snapshot && (!best || snapshot.bars.length > best.bars.length)) return snapshot;
    if (best) return best;
    throw readError ?? failure('price_unavailable', '历史行情暂不可用。');
  }

  return async function load({ticker:input, market, recommended_at}) {
    const ticker = typeof input === 'string' && ['A','HK','US'].includes(market) && normalizeSecurityTicker(input, market);
    const instant = Date.parse(recommended_at);
    if (!ticker || classifyMarket(ticker) !== market || !Number.isFinite(instant)) throw failure('invalid_request', '标的、市场或建议时间无效。', 400);
    const date = exchangeDate(new Date(instant).toISOString(), market);
    const key = JSON.stringify([ticker, market, date]);
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return structuredClone(cached.value);
    if (!pending.has(key)) {
      const task = read(ticker, market, date).then(value => {
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expires:value.d10Date && value.mode === 'provider' ? Infinity : now() + 30_000 });
        return value;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return structuredClone(await pending.get(key));
  };
}

export const loadMarketWindow = createMarketWindowLoader();
