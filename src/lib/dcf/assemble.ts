import type { DcfAssumptions } from './engine';
import { chat, extractJson, isLLMConfigured } from '@/lib/data/sources/llm';

export const DEFAULT_ASSUMPTIONS: DcfAssumptions = {
  revenueLines: [{ name: '主营业务', baseRevenue: 100, cagr: 0.08 }],
  grossMarginPct: 0.4, sgaPct: 0.15, rdPct: 0.05, sbcPct: 0.02,
  daPct: 0.04, capexPct: 0.05, wcPctOfRev: 0.05, taxRate: 0.25,
  wacc: 0.1, terminalG: 0.025, forecastYears: 8,
  sharesDiluted: 1000, netDebt: 0, exitEvEbitda: 12,
  currency: 'CNY', currencyUnit: '亿',
};

/** Pure deep-merge: defaults < seed < overrides. Guarantees a complete, finite DcfAssumptions. */
export function mergeAssumptions(
  seed: Partial<DcfAssumptions>,
  overrides: Partial<DcfAssumptions>,
): DcfAssumptions {
  const merged = { ...DEFAULT_ASSUMPTIONS, ...clean(seed), ...clean(overrides) } as DcfAssumptions;
  if (!merged.revenueLines || merged.revenueLines.length === 0)
    merged.revenueLines = DEFAULT_ASSUMPTIONS.revenueLines;
  return merged;
}

/** Drop undefined/null/NaN so they don't overwrite a good default. */
function clean<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export interface AssembleResult { assumptions: DcfAssumptions; warnings: string[]; }

/**
 * Build assumptions for a ticker: seed from financials JSON (best-effort field mapping),
 * optionally ask the LLM to fill revenue decomposition + growth, then merge with overrides.
 */
export async function assembleAssumptions(
  ticker: string,
  financials: unknown,
  overrides: Partial<DcfAssumptions> = {},
): Promise<AssembleResult> {
  const warnings: string[] = [];
  const seed = seedFromFinancials(financials, warnings);

  let llmSeed: Partial<DcfAssumptions> = {};
  if (isLLMConfigured()) {
    try {
      const resp = await chat({
        system: 'You are a sell-side analyst. Output ONLY JSON matching the requested shape. Numbers in 亿 (CNY 100M) unless told otherwise.',
        messages: [{ role: 'user', content: extractPrompt(ticker, seed) }],
        max_tokens: 700,
        responseJson: true,
      });
      llmSeed = clean(extractJson(resp.content) as Partial<DcfAssumptions>);
    } catch {
      warnings.push('AI 假设抽取失败，使用财报种子 + 默认值。');
    }
  } else {
    warnings.push('未配置 LLM，使用财报种子 + 默认假设。');
  }

  const assumptions = mergeAssumptions({ ...seed, ...llmSeed }, overrides);
  warnings.push('DCF 假设含 AI/默认估计，关键数据请人工复核。');
  return { assumptions, warnings };
}

/** Best-effort map of the /api/financials payload onto seed fields. Unknown → omitted. */
function seedFromFinancials(financials: unknown, warnings: string[]): Partial<DcfAssumptions> {
  const f = financials as Record<string, any> | null;
  if (!f || typeof f !== 'object') { warnings.push('暂无财报数据，DCF 基于默认假设。'); return {}; }
  const seed: Partial<DcfAssumptions> = {};
  const latestRevenue = num(f.revenue ?? f.totalRevenue ?? f?.latest?.revenue);
  if (latestRevenue) seed.revenueLines = [{ name: '主营业务', baseRevenue: latestRevenue, cagr: 0.08 }];
  const gm = num(f.grossMargin ?? f?.latest?.grossMargin);
  if (gm) seed.grossMarginPct = gm > 1 ? gm / 100 : gm;
  const shares = num(f.sharesDiluted ?? f.shares ?? f?.latest?.shares);
  if (shares) seed.sharesDiluted = shares;
  const netDebt = num(f.netDebt ?? f?.latest?.netDebt);
  if (netDebt !== null) seed.netDebt = netDebt;
  return seed;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function extractPrompt(ticker: string, seed: Partial<DcfAssumptions>): string {
  return [
    `为 ${ticker} 估计一组 DCF 假设。已知种子（可能不全）：`,
    JSON.stringify(seed),
    '返回 JSON，仅含这些键（缺失用合理行业值）：',
    '{"revenueLines":[{"name":"","baseRevenue":0,"cagr":0}],"grossMarginPct":0,"sgaPct":0,"rdPct":0,',
    '"sbcPct":0,"daPct":0,"capexPct":0,"wcPctOfRev":0,"taxRate":0,"wacc":0,"terminalG":0,',
    '"forecastYears":8,"sharesDiluted":0,"netDebt":0,"exitEvEbitda":12}',
  ].join('\n');
}
