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

// ─── Morning-note guardrails (adapted from anthropics/financial-services
//     plugins/agent-plugins/earnings-reviewer/skills/morning-note/SKILL.md,
//     Apache-2.0) ─────────────────────────────────────────────────────────
const MORNING_NOTE_DOCTRINE = `
你是 Stock Monitor 的早间研究主管。按机构 morning note 标准写作，规则如下：

【数据来源 hierarchy】
- 优先 MCP / 已验证数据（Tushare、东方财富、FRED、EDGAR）
- 严禁把网络搜索作为主要数据源；任何来源不明的数字标记为 [UNSOURCED]
- 若数据缺失，宁可说"暂无数据"，不要编造

【时效】
- "今天是 \${TODAY}"；所有数据必须 ≤ 90 天内
- 引用任何价格 / 财报数字时附上数据时间戳（如 "截至 16:00 CST"）

【风格】
- Be opinionated：不写观点的 morning note 没有价值
- Lead with the headline：不要把最重要的事埋在第三屏
- "No news is a valid morning note"：如果今天确实没事，明说"今日无重大事件，维持持仓"
- 区分 actionable（财报、并购、评级变动）和 noise（小幅波动、无关分析师评论）
- 2 分钟可读完：1 页就够

【合规】
- 严禁使用"建议买入/卖出/必涨/明天会涨"等措辞
- 替换为"信号偏多/偏空/中性"、"注意力优先级"
- 末尾必须含免责声明：本简报仅作决策辅助，不构成投资建议
`.trim();


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
  /** LLM-generated headline ("Top Call") — 1-2 sentences from morning-note doctrine */
  top_call?: { headline: string; rationale: string; ticker: string };
  /** Trade ideas with risk callouts; only emitted if conviction ≥ 7 */
  trade_ideas?: Array<{ ticker: string; name: string; bias: 'bull' | 'bear'; thesis: string; risk: string; conviction: number }>;
  markdown: string;
  /** Email-ready HTML with inlined styles */
  html?: string;
  /** Recommended email subject line — derived from Top Call when available */
  subject?: string;
  meta: {
    duration_ms: number;
    tokens?: { input: number; output: number };
    est_cost_usd?: number;
    failures?: number;
    /** Which provider+model generated the brief (deepseek-chat / claude-sonnet etc) */
    provider?: string;
    model?: string;
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

/**
 * LLM-generated headline for #1 priority stock — the "Top Call" in
 * institutional morning notes. Synthesizes signals + perspectives into a
 * single opinionated 2-sentence headline.
 */
async function generateTopCall(top: BriefStockBlock): Promise<DailyBrief['top_call'] | null> {
  if (!isLLMConfigured()) return null;
  if (top.perspectives.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const triggers = top.triggers.map((t) => t.desc).join(' · ') || '无显著触发';
  const bullish = top.perspectives.filter((p) => p.stance === 'bullish').length;
  const bearish = top.perspectives.filter((p) => p.stance === 'bearish').length;
  const repBull = top.perspectives.filter((p) => p.stance === 'bullish').sort((a, b) => b.confidence - a.confidence)[0];
  const repBear = top.perspectives.filter((p) => p.stance === 'bearish').sort((a, b) => b.confidence - a.confidence)[0];

  const prompt = `今天是 ${today}。基于以下数据为机构 morning note 写一个 "Top Call" 标题。

【#1 注意力标的】
${top.name} (${top.ticker}) · ${top.currency}${top.price} ${top.change_pct >= 0 ? '+' : ''}${top.change_pct.toFixed(2)}%
触发：${triggers}
${top.pe_ttm != null ? `PE TTM ${top.pe_ttm.toFixed(1)} · ` : ''}${top.pb != null ? `PB ${top.pb.toFixed(2)} · ` : ''}${top.roe != null ? `ROE ${top.roe.toFixed(1)}%` : ''}

【AI 委员会观点】共识 ${top.consensus.toFixed(1)}/10 · ${bullish} 多 / ${bearish} 空
${repBull ? `多方代表（${repBull.name}）：${repBull.summary}` : ''}
${repBear ? `空方代表（${repBear.name}）：${repBear.summary}` : ''}

输出严格 JSON:
{"headline": "<≤30字 opinionated 标题，机构 morning note 口吻>",
 "rationale": "<≤80字 一句话理由，引用具体数据点>"}

注意：
- 必须有观点（不是中立总结）
- 用"信号偏多/偏空/中性"，不用"建议买入/卖出"
- 引用至少 1 个具体数字`;

  try {
    const resp = await chat({
      system: MORNING_NOTE_DOCTRINE,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.5,
      timeoutMs: 20_000,
      responseJson: true,
    });
    const parsed = extractJson(resp.content);
    if (!parsed?.headline) return null;
    return {
      headline: String(parsed.headline).slice(0, 80),
      rationale: String(parsed.rationale || '').slice(0, 200),
      ticker: top.ticker,
    };
  } catch {
    return null;
  }
}

/**
 * Derive trade ideas from high-conviction perspectives (≥ 7/10).
 * Adapted from morning-note "Trade Ideas" section with explicit risk callout.
 */
function deriveTradeIdeas(blocks: BriefStockBlock[]): DailyBrief['trade_ideas'] {
  const ideas: NonNullable<DailyBrief['trade_ideas']> = [];
  for (const b of blocks) {
    if (b.perspectives.length === 0) continue;
    // Find highest-conviction directional perspective
    const bull = b.perspectives.filter((p) => p.stance === 'bullish').sort((a, b) => b.confidence - a.confidence)[0];
    const bear = b.perspectives.filter((p) => p.stance === 'bearish').sort((a, b) => b.confidence - a.confidence)[0];
    const top = (bull?.confidence ?? 0) >= (bear?.confidence ?? 0) ? bull : bear;
    if (!top || top.confidence < 7) continue;
    // Find an opposing view to phrase the "risk"
    const opposing = top.stance === 'bullish' ? bear : bull;
    ideas.push({
      ticker: b.ticker,
      name: b.name,
      bias: top.stance === 'bullish' ? 'bull' : 'bear',
      thesis: `${top.name}: ${top.summary.slice(0, 100)}`,
      risk: opposing
        ? `${opposing.name}: ${opposing.summary.slice(0, 80)}`
        : '若关键数据点变化（如财报不及预期、政策变动），需重新评估',
      conviction: top.confidence,
    });
  }
  return ideas.length > 0 ? ideas : undefined;
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

  // 5a. Generate Top Call (LLM headline for #1 priority)
  const topCall = (!opts.skipLLM && blocks.length > 0) ? await generateTopCall(blocks[0]) : null;

  // 5b. Derive trade ideas from high-conviction perspectives
  const tradeIdeas = deriveTradeIdeas(blocks);

  // 6. Compose markdown (deterministic template — uses LLM output above)
  const date = new Date().toISOString().slice(0, 10);
  const composeArgs = {
    date,
    blocks,
    overall,
    overall_label,
    watchlist_count: watchlist.length,
    topCall: topCall || undefined,
    tradeIdeas,
  };
  const md = composeMarkdown(composeArgs);
  const sanitized = applyCompliance(md);

  // 7. Compose HTML (email-ready, parallel to markdown)
  const html = applyCompliance(composeHTML(composeArgs));
  const subject = topCall
    ? `Sentinel ${date} · ${topCall.headline}`
    : `Sentinel Morning Note · ${date} · ${overall_label}`;

  return {
    date,
    generated_at: new Date().toISOString(),
    watchlist_count: watchlist.length,
    top: blocks,
    overall_confidence: overall,
    overall_label,
    top_call: topCall || undefined,
    trade_ideas: tradeIdeas,
    markdown: sanitized,
    html,
    subject,
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
  topCall?: DailyBrief['top_call'];
  tradeIdeas?: DailyBrief['trade_ideas'];
}

/**
 * Compose morning-note style markdown. Section order (institutional standard):
 *   1. Header (date + analyst + macro context)
 *   2. **Top Call** — the one thing readers need to see first
 *   3. Overnight/Pre-Market Developments — Top 5 stocks with one-line take
 *   4. **Trade Ideas** (only if conviction ≥ 7) with explicit risk
 *   5. Disclaimer
 */
function composeMarkdown(a: ComposeArgs): string {
  const lines: string[] = [];
  const star = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));

  // ─── 1. Header ──────────────────────────────────────────────
  lines.push(`*Sentinel Morning Note · ${a.date}*`);
  lines.push(`_由 Stock Monitor AI 委员会编辑 · 截至生成时刻数据_`);
  lines.push('');
  lines.push(`📊 委员会信心：*${a.overall.toFixed(1)} / 10* — ${a.overall_label}`);
  lines.push(`📋 ${a.watchlist_count} 只股票池 · Top ${a.blocks.length} 进入注意力优先级`);
  lines.push('');

  // ─── 2. Top Call ────────────────────────────────────────────
  if (a.topCall) {
    lines.push('────────────────');
    lines.push('');
    lines.push(`🎯 *Top Call · ${a.topCall.headline}*`);
    if (a.topCall.rationale) lines.push(a.topCall.rationale);
    const topBlock = a.blocks.find((b) => b.ticker === a.topCall!.ticker);
    if (topBlock) {
      lines.push(`  ↗ ${topBlock.name} (${topBlock.ticker}) ${topBlock.currency}${topBlock.price.toFixed(2)} ${topBlock.change_pct >= 0 ? '+' : ''}${topBlock.change_pct.toFixed(2)}%`);
    }
    lines.push('');
  }

  // ─── 3. Overnight / Pre-Market Developments ─────────────────
  lines.push('────────────────');
  lines.push('');
  lines.push('📰 *Overnight & Pre-Market Developments*');
  lines.push('');

  if (a.blocks.length === 0) {
    lines.push('_今日无重大事件，维持持仓。（"No news is a valid morning note."）_');
    lines.push('');
  } else {
    for (let i = 0; i < a.blocks.length; i++) {
      const b = a.blocks[i];
      const stars = star(Math.round(Math.min(b.consensus, 10) / 2));
      lines.push(`*#${i + 1} ${b.name}* (${b.ticker})  ${stars}  共识 ${b.consensus.toFixed(1)}/10`);
      lines.push(`💰 ${b.currency}${b.price.toFixed(2)}  ${b.change_pct >= 0 ? '+' : ''}${b.change_pct.toFixed(2)}%`);

      if (b.triggers.length > 0) {
        lines.push(`📍 ${b.triggers.map((t) => t.desc).join(' · ')}`);
      }

      const funda: string[] = [];
      if (b.pe_ttm != null) funda.push(`PE ${b.pe_ttm.toFixed(1)}`);
      if (b.pb != null) funda.push(`PB ${b.pb.toFixed(2)}`);
      if (b.roe != null) funda.push(`ROE ${b.roe.toFixed(1)}%`);
      if (funda.length) lines.push(`📐 ${funda.join(' · ')}`);

      if (b.perspectives.length > 0) {
        const bulls = b.perspectives.filter((p) => p.stance === 'bullish');
        const neutrals = b.perspectives.filter((p) => p.stance === 'neutral');
        const bears = b.perspectives.filter((p) => p.stance === 'bearish');
        lines.push(`🤖 ${bulls.length} 多 / ${neutrals.length} 中 / ${bears.length} 空`);

        const repBull = bulls.sort((a, b) => b.confidence - a.confidence)[0];
        const repBear = bears.sort((a, b) => b.confidence - a.confidence)[0];
        if (repBull) lines.push(`  🟢 ${repBull.name}：${repBull.summary.slice(0, 90)}`);
        if (repBear) lines.push(`  🔴 ${repBear.name}：${repBear.summary.slice(0, 90)}`);
      }
      lines.push('');
    }
  }

  // ─── 4. Trade Ideas (high-conviction only) ──────────────────
  if (a.tradeIdeas && a.tradeIdeas.length > 0) {
    lines.push('────────────────');
    lines.push('');
    lines.push('💡 *Trade Ideas* (置信 ≥ 7/10)');
    lines.push('');
    for (const idea of a.tradeIdeas) {
      const biasIcon = idea.bias === 'bull' ? '📈 偏多' : '📉 偏空';
      lines.push(`*${biasIcon}* ${idea.name} (${idea.ticker}) · 置信 ${idea.conviction.toFixed(1)}/10`);
      lines.push(`  论点：${idea.thesis}`);
      lines.push(`  ⚠️ 风险：${idea.risk}`);
      lines.push('');
    }
  } else {
    lines.push('────────────────');
    lines.push('');
    lines.push('💡 *Trade Ideas* — _今日无高置信（≥ 7/10）信号，观望为主_');
    lines.push('');
  }

  // ─── 5. Footer ──────────────────────────────────────────────
  lines.push('────────────────');
  lines.push('');
  lines.push('🔗 完整简报 / K 线 / 财报 / 股东持仓 / Backtest 排行榜：');
  lines.push('https://stock-monitor-nu.vercel.app/');
  lines.push('');
  lines.push('_本内容由 AI 自动生成，仅作为决策辅助参考，不构成任何投资建议。_');
  lines.push('_数据源：东方财富（A/H/US 报价）· Tushare Pro（A 股财报）· DeepSeek V4 Flash（AI 委员会）_');

  return lines.join('\n');
}

// ─── HTML composer (email-ready, inline CSS) ────────────────────────────────

const HTML_PALETTE = {
  bg: '#0d1117',
  card: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  dim: '#8b949e',
  muted: '#6e7681',
  accent: '#58a6ff',
  up: '#ef4444',
  down: '#10b981',
  warn: '#f59e0b',
};

const esc = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function biasColor(changePct: number): string {
  return changePct > 0 ? HTML_PALETTE.up : changePct < 0 ? HTML_PALETTE.down : HTML_PALETTE.dim;
}

function composeHTML(a: ComposeArgs): string {
  const sections: string[] = [];

  // ─── Header ────────────────────────────────────────────────
  sections.push(`
    <h1 style="margin:0;padding:0;font-size:22px;font-weight:700;color:${HTML_PALETTE.text};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif">
      🎯 Sentinel Morning Note · ${esc(a.date)}
    </h1>
    <p style="margin:6px 0 0;color:${HTML_PALETTE.dim};font-size:12px">
      由 Stock Monitor AI 委员会编辑 · 截至生成时刻数据
    </p>
    <div style="margin:14px 0 0;padding:10px 14px;background:${HTML_PALETTE.card};border-radius:8px;border:1px solid ${HTML_PALETTE.border};font-size:13px;color:${HTML_PALETTE.text}">
      📊 委员会信心：<strong style="color:${HTML_PALETTE.accent}">${a.overall.toFixed(1)} / 10</strong> — ${esc(a.overall_label)}<br>
      📋 ${a.watchlist_count} 只股票池 · Top ${a.blocks.length} 进入注意力优先级
    </div>
  `);

  // ─── Top Call ──────────────────────────────────────────────
  if (a.topCall) {
    const topBlock = a.blocks.find((b) => b.ticker === a.topCall!.ticker);
    sections.push(`
      <div style="margin:18px 0 0;padding:14px 16px;background:linear-gradient(135deg,#1f6feb20,#161b22);border:1px solid ${HTML_PALETTE.accent};border-radius:10px">
        <div style="font-size:11px;color:${HTML_PALETTE.accent};font-weight:700;text-transform:uppercase;letter-spacing:1px">🎯 Top Call</div>
        <div style="margin-top:6px;font-size:16px;font-weight:700;color:${HTML_PALETTE.text};line-height:1.4">
          ${esc(a.topCall.headline)}
        </div>
        ${a.topCall.rationale ? `<div style="margin-top:6px;font-size:13px;color:${HTML_PALETTE.text};line-height:1.6">${esc(a.topCall.rationale)}</div>` : ''}
        ${topBlock ? `<div style="margin-top:8px;font-size:12px;color:${HTML_PALETTE.dim}">↗ ${esc(topBlock.name)} (${esc(topBlock.ticker)}) <span style="color:${HTML_PALETTE.text};font-family:monospace">${esc(topBlock.currency)}${topBlock.price.toFixed(2)}</span> <span style="color:${biasColor(topBlock.change_pct)};font-family:monospace">${topBlock.change_pct >= 0 ? '+' : ''}${topBlock.change_pct.toFixed(2)}%</span></div>` : ''}
      </div>
    `);
  }

  // ─── Overnight / Pre-Market ────────────────────────────────
  sections.push(`<h2 style="margin:22px 0 10px;font-size:15px;color:${HTML_PALETTE.text};border-bottom:1px solid ${HTML_PALETTE.border};padding-bottom:6px">📰 Overnight &amp; Pre-Market Developments</h2>`);

  if (a.blocks.length === 0) {
    sections.push(`<p style="color:${HTML_PALETTE.muted};font-style:italic">今日无重大事件，维持持仓。（"No news is a valid morning note."）</p>`);
  } else {
    a.blocks.forEach((b, i) => {
      const stars = '★'.repeat(Math.max(0, Math.min(5, Math.round(b.consensus / 2)))) + '☆'.repeat(Math.max(0, 5 - Math.round(b.consensus / 2)));
      const bulls = b.perspectives.filter((p) => p.stance === 'bullish');
      const neutrals = b.perspectives.filter((p) => p.stance === 'neutral');
      const bears = b.perspectives.filter((p) => p.stance === 'bearish');
      const repBull = bulls.sort((x, y) => y.confidence - x.confidence)[0];
      const repBear = bears.sort((x, y) => y.confidence - x.confidence)[0];

      const funda: string[] = [];
      if (b.pe_ttm != null) funda.push(`PE ${b.pe_ttm.toFixed(1)}`);
      if (b.pb != null) funda.push(`PB ${b.pb.toFixed(2)}`);
      if (b.roe != null) funda.push(`ROE ${b.roe.toFixed(1)}%`);

      sections.push(`
        <div style="margin:12px 0;padding:12px 14px;background:${HTML_PALETTE.card};border:1px solid ${HTML_PALETTE.border};border-radius:8px">
          <div style="font-size:14px;color:${HTML_PALETTE.text}">
            <strong>#${i + 1} ${esc(b.name)}</strong>
            <span style="color:${HTML_PALETTE.dim};font-size:12px">(${esc(b.ticker)})</span>
            <span style="color:${HTML_PALETTE.warn};font-size:11px;margin-left:6px;letter-spacing:1px">${stars}</span>
            <span style="float:right;font-size:11px;color:${HTML_PALETTE.dim}">共识 ${b.consensus.toFixed(1)}/10</span>
          </div>
          <div style="margin:6px 0;font-family:monospace;font-size:13px">
            <span style="font-weight:700">${esc(b.currency)}${b.price.toFixed(2)}</span>
            <span style="color:${biasColor(b.change_pct)};margin-left:6px">${b.change_pct >= 0 ? '+' : ''}${b.change_pct.toFixed(2)}%</span>
          </div>
          ${b.triggers.length > 0 ? `<div style="font-size:12px;color:${HTML_PALETTE.dim};margin:4px 0">📍 ${esc(b.triggers.map((t) => t.desc).join(' · '))}</div>` : ''}
          ${funda.length > 0 ? `<div style="font-size:12px;color:${HTML_PALETTE.dim};margin:4px 0">📐 ${esc(funda.join(' · '))}</div>` : ''}
          ${b.perspectives.length > 0 ? `
            <div style="font-size:12px;color:${HTML_PALETTE.dim};margin:6px 0 4px">🤖 ${bulls.length} 多 / ${neutrals.length} 中 / ${bears.length} 空</div>
            ${repBull ? `<div style="margin:3px 0;padding-left:6px;border-left:2px solid ${HTML_PALETTE.up};font-size:12px;color:${HTML_PALETTE.text}">🟢 <strong>${esc(repBull.name)}</strong>：${esc(repBull.summary.slice(0, 100))}</div>` : ''}
            ${repBear ? `<div style="margin:3px 0;padding-left:6px;border-left:2px solid ${HTML_PALETTE.down};font-size:12px;color:${HTML_PALETTE.text}">🔴 <strong>${esc(repBear.name)}</strong>：${esc(repBear.summary.slice(0, 100))}</div>` : ''}
          ` : ''}
        </div>
      `);
    });
  }

  // ─── Trade Ideas ───────────────────────────────────────────
  sections.push(`<h2 style="margin:22px 0 10px;font-size:15px;color:${HTML_PALETTE.text};border-bottom:1px solid ${HTML_PALETTE.border};padding-bottom:6px">💡 Trade Ideas</h2>`);
  if (a.tradeIdeas && a.tradeIdeas.length > 0) {
    a.tradeIdeas.forEach((idea) => {
      const color = idea.bias === 'bull' ? HTML_PALETTE.up : HTML_PALETTE.down;
      const icon = idea.bias === 'bull' ? '📈 偏多' : '📉 偏空';
      sections.push(`
        <div style="margin:10px 0;padding:10px 14px;background:${HTML_PALETTE.card};border:1px solid ${HTML_PALETTE.border};border-left:3px solid ${color};border-radius:6px;font-size:12px;color:${HTML_PALETTE.text}">
          <div><strong style="color:${color}">${icon}</strong> ${esc(idea.name)} <span style="color:${HTML_PALETTE.dim}">(${esc(idea.ticker)})</span> · <span style="color:${HTML_PALETTE.dim}">置信 ${idea.conviction.toFixed(1)}/10</span></div>
          <div style="margin:5px 0">论点：${esc(idea.thesis)}</div>
          <div style="color:${HTML_PALETTE.warn}">⚠️ 风险：${esc(idea.risk)}</div>
        </div>
      `);
    });
  } else {
    sections.push(`<p style="color:${HTML_PALETTE.muted};font-style:italic;font-size:13px">今日无高置信（≥ 7/10）信号，观望为主。</p>`);
  }

  // ─── Footer ────────────────────────────────────────────────
  sections.push(`
    <div style="margin:24px 0 0;padding:12px 14px;background:${HTML_PALETTE.card};border:1px solid ${HTML_PALETTE.border};border-radius:8px;font-size:11px;color:${HTML_PALETTE.muted};line-height:1.6">
      🔗 <a href="https://stock-monitor-nu.vercel.app/" style="color:${HTML_PALETTE.accent};text-decoration:none">stock-monitor-nu.vercel.app</a> — 完整简报 / K 线 / 财报 / 股东持仓 / Backtest 排行榜<br>
      <em>本内容由 AI 自动生成，仅作为决策辅助参考，不构成任何投资建议。</em><br>
      <em>数据源：东方财富（A/H/US 报价）· Tushare Pro（A 股财报）· DeepSeek V4 Flash（AI 委员会）</em>
    </div>
  `);

  // Wrap in email-safe container
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${HTML_PALETTE.bg};color:${HTML_PALETTE.text};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 20px;background:${HTML_PALETTE.bg}">
    ${sections.join('\n')}
  </div>
</body>
</html>`;
}
