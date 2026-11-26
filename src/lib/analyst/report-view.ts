import type { AnalystReport, ReportRecommendation, ReportTrade } from './report-types';
import { BEIJING_TIME_ZONE } from './recommendation-time';

export function reportStats(recommendations: ReportRecommendation[], trades: ReportTrade[]) {
  const active = recommendations.filter(row => !row.withdrawnAt);
  const scores = active.flatMap(row => row.score === null ? [] : [row.score]);
  const assessed = active.filter(row => row.hit !== null);
  const hits = assessed.filter(row => row.hit).length;
  return {
    registered: recommendations.length, active: active.length, withdrawn: recommendations.length - active.length,
    scored: scores.length, average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    assessed: assessed.length, hits, hitRate: assessed.length ? 100 * hits / assessed.length : null,
    fills: trades.length, executedRecommendations: new Set(trades.map(row => row.recommendationId)).size,
  };
}

export function selectReport(data: AnalystReport, analystId: string) {
  const analysts = data.analysts.filter(row => !analystId || row.id === analystId);
  const recommendations = analystId ? data.recommendations.filter(row => row.analystId === analystId) : data.recommendations;
  const trades = analystId ? data.trades.filter(row => row.analystId === analystId) : data.trades;
  const byAnalyst = new Map(analysts.map(row => [row.id, { analyst: row, recommendations: [] as ReportRecommendation[], trades: [] as ReportTrade[] }]));
  const recById = new Map(recommendations.map(row => [row.id, row]));
  const fillCounts = new Map<string, number>();
  const byCurrency = new Map<string, { buys: number; sells: number; gross: number; fees: number }>();
  for (const row of recommendations) byAnalyst.get(row.analystId)?.recommendations.push(row);
  for (const row of trades) {
    byAnalyst.get(row.analystId)?.trades.push(row);
    fillCounts.set(row.recommendationId, (fillCounts.get(row.recommendationId) ?? 0) + 1);
    const totals = byCurrency.get(row.currency) ?? { buys: 0, sells: 0, gross: 0, fees: 0 };
    if (row.direction === 'buy') totals.buys++; else totals.sells++;
    totals.gross += row.quantity * row.price;
    totals.fees += row.fee;
    byCurrency.set(row.currency, totals);
  }
  const members = [...byAnalyst.values()].map(({ analyst, recommendations: recs, trades: fills }) => ({
    ...analyst, stats: reportStats(recs, fills),
  }));
  return { recommendations, trades, byAnalyst, recById, fillCounts, byCurrency, members, stats: reportStats(recommendations, trades) };
}

export type SelectedReport = ReturnType<typeof selectReport>;
export type ReportTranslator = (key: string, values?: Record<string, string | number>) => string;

export const reportNumber = (value: number | null, places = 1) => value === null ? '—' : value.toFixed(places);
export const reportRate = (value: number | null) => value === null ? '—' : reportNumber(value) + '%';

export function reportTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'zh-CN', {
    timeZone: BEIJING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

export function reportAnalysis(view: SelectedReport, t: ReportTranslator) {
  const s = view.stats;
  const bySymbol = new Map<string, { count: number; buys: number; sells: number }>();
  for (const row of view.recommendations) {
    const symbol = row.ticker;
    const item = bySymbol.get(symbol) ?? { count: 0, buys: 0, sells: 0 };
    item.count++;
    if (row.action === 'buy' || row.action === 'add') item.buys++;
    if (row.action === 'sell' || row.action === 'trim') item.sells++;
    bySymbol.set(symbol, item);
  }
  const sorted = [...bySymbol].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const leading = sorted.filter(([, item]) => item.count === sorted[0][1].count);
  const leader = leading[0];
  const concentration = leader && (leading.length === 1
    ? t('report.analysis.concentration', { ticker: leader[0], count: leader[1].count, buys: leader[1].buys, sells: leader[1].sells,
      others: leader[1].count - leader[1].buys - leader[1].sells })
    : t('report.analysis.tie', { tickers: leading.length, count: leader[1].count }));
  return [
    t('report.analysis.registration', { registered: s.registered, active: s.active, withdrawn: s.withdrawn }),
    ...(concentration ? [concentration] : []),
    s.assessed ? t('report.analysis.hit', { hits: s.hits, n: s.assessed, rate: reportRate(s.hitRate) }) : t('report.analysis.noHit'),
    s.scored ? t('report.analysis.score', { score: reportNumber(s.average), n: s.scored }) : t('report.analysis.noScore'),
    s.fills ? t('report.analysis.trades', { fills: s.fills, recs: s.executedRecommendations }) : t('report.analysis.noTrades'),
    ...Array.from(view.byCurrency, ([currency, v]) => t('report.analysis.currency', {
      currency, buys: v.buys, sells: v.sells, gross: v.gross.toFixed(2), fees: v.fees.toFixed(2),
    })),
  ];
}

function markdownCell(value: string | number) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/[\\|`!*_[\]<>]/g, char => '\\' + char);
}

function markdownTable(headers: string[], rows: (string | number)[][]) {
  const line = (cells: (string | number)[]) => '| ' + cells.map(markdownCell).join(' | ') + ' |';
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function reportMarkdown(view: SelectedReport, scope: string, generatedAt: string, locale: string, t: ReportTranslator) {
  const cell = (value: number | null) => value === null ? '—' : String(value);
  const member = (id: string) => view.byAnalyst.get(id)?.analyst.name ?? '—';
  const heading = (key: string) => '## ' + t('report.' + key);
  return [
    '# ' + t('report.analysis.title'), markdownCell(scope) + ' · ' + t('report.asOf', { time: reportTime(generatedAt, locale) }),
    ...reportAnalysis(view, t), heading('members'),
    markdownTable(['analyst','registered','hitRate','assessed','avgScore','scored','trades'].map(k => t('report.' + k)),
      view.members.map(m => [m.name, m.stats.registered, reportRate(m.stats.hitRate), m.stats.assessed, reportNumber(m.stats.average), m.stats.scored, m.stats.fills])),
    heading('recommendations'),
    view.recommendations.length ? markdownTable(['id','analyst','time','ticker','action','status','score','hit','fills'].map(k => t('report.' + k)),
      view.recommendations.map(r => [r.id, member(r.analystId), reportTime(r.recommendedAt, locale), r.ticker, t('action.' + r.action),
        t(r.withdrawnAt ? 'report.withdrawn' : 'report.active'), cell(r.score), r.hit === null ? '—' : t(r.hit ? 'report.yes' : 'report.no'), view.fillCounts.get(r.id) ?? 0])) : t('report.noRecs'),
    heading('trades'),
    view.trades.length ? markdownTable(['tradeId','source','analyst','time','ticker','action','quantity','price','fee','currency'].map(k => t('report.' + k)),
      view.trades.map(r => [r.id, r.recommendationId, member(r.analystId), reportTime(r.executedAt, locale), r.ticker, t('action.' + r.direction), r.quantity, r.price, r.fee, r.currency])) : t('report.noTrades'),
  ].join('\n\n') + '\n';
}
