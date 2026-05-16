/**
 * Daily brief composer — orchestrates data + LLM into a 5-minute-readable
 * Markdown briefing. Runs on Vercel cron or via API preview.
 *
 * Pipeline:
 *   1. For each ticker in watchlist: fetch quote (Eastmoney) + A-share supplements (Tushare)
 *   2. Compute signal score (financial triggers — earnings, anomalous volume, etc.)
 *   3. Take Top N by score
 *   4. For each Top: run 9-persona AI committee in parallel (DeepSeek)
 *   5. Final composition: use DeepSeek Opus-tier model to write the brief
 *      with strict compliance language (no '建议买入/卖出', etc.)
 */

import { fetchEastmoneyQuote, type EastmoneyQuote } from '@/lib/data/sources/eastmoney';
import {
  isTushareConfigured,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
} from '@/lib/data/sources/tushare';
import { PERSONAS, buildUserMessage, type StockContext, type PerspectiveResult } from '@/lib/data/personas';
import { chat, extractJson, isLLMConfigured } from '@/lib/data/sources/llm';

// ─── Default demo watchlist (used when no user-specific list passed) ───
export const DEFAULT_WATCHLIST: string[] = [
  '600519.SH',  // 贵州茅台
  '002624.SZ',  // 完美世界
  '002594.SZ',  // 比亚迪
  '300750.SZ',  // 宁德时代
  '00700.HK',   // 腾讯
  '09988.HK',   // 阿里巴巴
  'AAPL',       // Apple
  'NVDA',       // 英伟达
  'MSFT',       // 微软
  'GOOGL',      // Alphabet
];

// ─── Signal triggers ───
interface SignalTrigger { rule: string; desc: string; weight: number }

interface EnrichedQuote {
  quote: EastmoneyQuote;
  pe_ttm: number | null;
  pb: number | null;
  roe: number | null;
  gross_margin: number | null;
  dv_ratio: number | null;
  triggers: SignalTrigger[];
  score: number;
}

async function enrich(ticker: string): Promise<EnrichedQuote | null> {
  const quote = await fetchEastmoneyQuote(ticker).catch(() => null);
  if (!quote) return null;

  let dailyBasic: any = null;
  let finaInd: any = null;
  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);
  if (isA && isTushareConfigured()) {
    [dailyBasic, finaInd] = await Promise.all([
      fetchTushareDailyBasic(ticker).catch(() => null),
      fetchTushareFinaIndicator(ticker).catch(() => null),
    ]);
  }

  const pe_ttm = dailyBasic?.pe_ttm ?? quote.pe_ttm ?? null;
  const pb = dailyBasic?.pb ?? quote.pb ?? null;
  const roe = finaInd?.roe ?? null;
  const gross_margin = finaInd?.grossprofit_margin ?? null;
  const dv_ratio = dailyBasic?.dv_ratio ?? null;
  const triggers = computeTriggers(quote, { pe_ttm, pb, roe });
  const score = triggers.reduce((s, t) => s + t.weight, 0);

  return { quote, pe_ttm, pb, roe, gross_margin, dv_ratio, triggers, score };
}

function computeTriggers(q: EastmoneyQuote, fund: { pe_ttm: number | null; pb: number | null; roe: number | null }): SignalTrigger[] {
  const t: SignalTrigger[] = [];
  // Large single-day move
  if (Math.abs(q.change_pct) >= 5) {
    t.push({ rule: 'large_move', desc: `单日 ${q.change_pct > 0 ? '+' : ''}${q.change_pct.toFixed(2)}%`, weight: 3 });
  } else if (Math.abs(q.change_pct) >= 3) {
    t.push({ rule: 'medium_move', desc: `单日 ${q.change_pct > 0 ? '+' : ''}${q.change_pct.toFixed(2)}%`, weight: 2 });
  }
  // High turnover (only for A-share with turnover known)
  if (q.turnover && q.turnover >= 5) {
    t.push({ rule: 'high_turnover', desc: `换手率 ${q.turnover.toFixed(2)}%`, weight: 2 });
  }
  // Volume spike (volume_ratio > 2)
  if (q.volume_ratio && q.volume_ratio >= 2) {
    t.push({ rule: 'anomalous_volume', desc: `量比 ${q.volume_ratio.toFixed(2)}x`, weight: 2 });
  }
  // High amplitude
  if (q.amplitude >= 5) {
    t.push({ rule: 'high_amplitude', desc: `振幅 ${q.amplitude.toFixed(2)}%`, weight: 1 });
  }
  // Valuation extremes
  if (fund.pe_ttm && fund.pe_ttm > 0 && fund.pe_ttm < 15) {
    t.push({ rule: 'low_pe', desc: `PE TTM ${fund.pe_ttm.toFixed(1)} 偏低`, weight: 1 });
  }
  if (fund.pe_ttm && fund.pe_ttm > 80) {
    t.push({ rule: 'high_pe', desc: `PE TTM ${fund.pe_ttm.toFixed(1)} 偏高`, weight: 1 });
  }
  // High quality
  if (fund.roe && fund.roe > 20 && fund.pb && fund.pb < 5) {
    t.push({ rule: 'quality_value', desc: `ROE ${fund.roe.toFixed(1)}% + PB ${fund.pb.toFixed(2)}`, weight: 1 });
  }
  return t;
}

// ─── Per-stock AI committee (9 personas) ───
async function runCommittee(en: EnrichedQuote): Promise<PerspectiveResult[]> {
  if (!isLLMConfigured()) return [];

  const ctx: StockContext = {
    ticker: en.quote.ticker,
    name: en.quote.name,
    market: en.quote.market,
    currency: en.quote.currency,
    price: en.quote.price,
    change_pct: en.quote.change_pct,
    pe_ttm: en.pe_ttm,
    pb: en.pb,
    roe: en.roe,
    market_cap_label: en.quote.market_cap_label,
    dividend_yield: en.dv_ratio,
    gross_margin: en.gross_margin,
  };
  const userMessage = buildUserMessage(ctx);

  const settled = await Promise.allSettled(
    PERSONAS.map(async (p): Promise<PerspectiveResult | null> => {
      const resp = await chat({
        system: p.prompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 400,
        temperature: 0.7,
        timeoutMs: 25_000,
        responseJson: true,
      });
      const parsed = extractJson(resp.content);
      if (!parsed) return null;
      const stance = (['bullish', 'neutral', 'bearish'] as const).includes(parsed.stance) ? parsed.stance : 'neutral';
      return {
        persona: p.id,
        name: p.name,
        stance,
        confidence: Math.max(0, Math.min(10, Number(parsed.confidence) || 5)),
        summary: String(parsed.summary || '').slice(0, 300),
        cites: Array.isArray(parsed.cites) ? parsed.cites.slice(0, 6).map(String) : [],
      };
    })
  );

  return settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((p): p is PerspectiveResult => p !== null);
}

// ─── Compose final brief ───
function consensusScore(perspectives: PerspectiveResult[]): number {
  if (perspectives.length === 0) return 5;
  const sum = perspectives.reduce((acc, p) => {
    const v = p.stance === 'bullish' ? p.confidence : p.stance === 'bearish' ? -p.confidence : 0;
    return acc + v;
  }, 0);
  return Number((sum / perspectives.length + 5).toFixed(1));
}

export interface BriefStockBlock {
  ticker: string;
  name: string;
  market: string;
  currency: string;
  price: number;
  change_pct: number;
  score: number;
  triggers: SignalTrigger[];
  pe_ttm: number | null;
  pb: number | null;
  roe: number | null;
  consensus: number;
  perspectives: PerspectiveResult[];
}

export interface DailyBrief {
  date: string;          // YYYY-MM-DD
  generated_at: string;  // ISO
  watchlist_count: number;
  top: BriefStockBlock[];
  overall_confidence: number;
  overall_label: '中性' | '偏多' | '偏空' | '偏多偏强' | '偏空偏强';
  markdown: string;
  meta: {
    duration_ms: number;
    tokens?: { input: number; output: number };
    est_cost_usd?: number;
    failures?: number;
  };
}

const COMPLIANCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/建议买入/g, '信号偏多'],
  [/建议卖出/g, '信号偏空'],
  [/推荐买入/g, '注意力优先级偏多'],
  [/必涨/g, '上行概率较高'],
  [/必跌/g, '下行概率较高'],
  [/强烈推荐/g, '高信心信号'],
  [/明天会涨/g, '短期信号偏多'],
  [/我建议/g, '综合视角倾向'],
  [/应该买/g, '决策辅助参考为多'],
  [/稳赚/g, '历史回测正向'],
];

function applyCompliance(text: string): string {
  let out = text;
  for (const [re, sub] of COMPLIANCE_REPLACEMENTS) {
    out = out.replace(re, sub);
  }
  return out;
}

export async function generateDailyBrief(
  watchlist: string[] = DEFAULT_WATCHLIST,
  opts: { topN?: number; skipLLM?: boolean } = {}
): Promise<DailyBrief> {
  const startedAt = Date.now();
  const topN = opts.topN ?? 5;

  // 1+2. Enrich + score
  const enrichedAll = await Promise.all(watchlist.map((t) => enrich(t)));
  const enriched = enrichedAll.filter((x): x is EnrichedQuote => x !== null);

  // Always include items with signals; if none, take top by absolute change
  const ranked = enriched.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.abs(b.quote.change_pct) - Math.abs(a.quote.change_pct);
  });
  const top = ranked.slice(0, topN);

  // 3. AI committee per top
  let totalInputTok = 0;
  let totalOutputTok = 0;
  const blocks: BriefStockBlock[] = await Promise.all(
    top.map(async (en) => {
      const perspectives = opts.skipLLM ? [] : await runCommittee(en);
      return {
        ticker: en.quote.ticker,
        name: en.quote.name,
        market: en.quote.market,
        currency: en.quote.currency,
        price: en.quote.price,
        change_pct: en.quote.change_pct,
        score: en.score,
        triggers: en.triggers,
        pe_ttm: en.pe_ttm,
        pb: en.pb,
        roe: en.roe,
        consensus: consensusScore(perspectives),
        perspectives,
      };
    })
  );

  // 4. Overall confidence (avg of per-stock consensus, shifted to 0-10)
  const overall = Number(
    (blocks.reduce((s, b) => s + b.consensus, 0) / Math.max(blocks.length, 1)).toFixed(1)
  );
  const overall_label: DailyBrief['overall_label'] =
    overall >= 7 ? '偏多偏强' :
    overall >= 6 ? '偏多' :
    overall >= 5 ? '中性' :
    overall >= 4 ? '偏空' : '偏空偏强';

  // 5. Compose markdown (deterministic template — no LLM needed for the wrapper)
  const date = new Date().toISOString().slice(0, 10);
  const md = composeMarkdown({ date, blocks, overall, overall_label, watchlist_count: watchlist.length });
  const sanitized = applyCompliance(md);

  return {
    date,
    generated_at: new Date().toISOString(),
    watchlist_count: watchlist.length,
    top: blocks,
    overall_confidence: overall,
    overall_label,
    markdown: sanitized,
    meta: {
      duration_ms: Date.now() - startedAt,
      tokens: { input: totalInputTok, output: totalOutputTok },
    },
  };
}

interface ComposeArgs {
  date: string;
  blocks: BriefStockBlock[];
  overall: number;
  overall_label: string;
  watchlist_count: number;
}

function composeMarkdown(a: ComposeArgs): string {
  const lines: string[] = [];
  const star = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));

  lines.push(`*Sentinel · ${a.date} 早间简报*`);
  lines.push('');
  lines.push(`📊 AI 委员会信心：*${a.overall.toFixed(1)} / 10* — ${a.overall_label}`);
  lines.push(`📋 股票池：${a.watchlist_count} 只 · Top ${a.blocks.length} 进入注意力优先级`);
  lines.push('');
  lines.push('────────────────');

  for (let i = 0; i < a.blocks.length; i++) {
    const b = a.blocks[i];
    const stars = star(Math.round(Math.min(b.consensus, 10) / 2));
    lines.push('');
    lines.push(`*#${i + 1} ${b.name}* (${b.ticker})  ${stars}  共识 ${b.consensus.toFixed(1)}/10`);
    lines.push(`💰 ${b.currency}${b.price.toFixed(2)}  ${b.change_pct >= 0 ? '+' : ''}${b.change_pct.toFixed(2)}%`);

    // Triggers
    if (b.triggers.length > 0) {
      lines.push(`📍 触发：${b.triggers.map((t) => t.desc).join(' · ')}`);
    }

    // Key fundamentals
    const funda: string[] = [];
    if (b.pe_ttm != null) funda.push(`PE ${b.pe_ttm.toFixed(1)}`);
    if (b.pb != null) funda.push(`PB ${b.pb.toFixed(2)}`);
    if (b.roe != null) funda.push(`ROE ${b.roe.toFixed(1)}%`);
    if (funda.length) lines.push(`📐 ${funda.join(' · ')}`);

    // AI committee summary — list bull / neutral / bear counts and 1 representative quote each
    if (b.perspectives.length > 0) {
      const bulls = b.perspectives.filter((p) => p.stance === 'bullish');
      const neutrals = b.perspectives.filter((p) => p.stance === 'neutral');
      const bears = b.perspectives.filter((p) => p.stance === 'bearish');
      lines.push(`🤖 ${bulls.length} 多 / ${neutrals.length} 中 / ${bears.length} 空`);

      // Pick representative views — highest confidence of each side
      const repBull = bulls.sort((a, b) => b.confidence - a.confidence)[0];
      const repBear = bears.sort((a, b) => b.confidence - a.confidence)[0];
      if (repBull) lines.push(`  🟢 ${repBull.name}：${repBull.summary.slice(0, 90)}`);
      if (repBear) lines.push(`  🔴 ${repBear.name}：${repBear.summary.slice(0, 90)}`);
    }
  }

  lines.push('');
  lines.push('────────────────');
  lines.push('');
  lines.push('💼 完整简报 + K 线 + 财报 + 股东持仓：');
  lines.push('https://stock-monitor-nu.vercel.app/');
  lines.push('');
  lines.push('_本内容由 AI 自动生成，仅作为决策辅助参考，不构成任何投资建议。_');

  return lines.join('\n');
}
