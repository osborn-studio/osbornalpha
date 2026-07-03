import { NextResponse } from 'next/server';
import { chat, extractJson, isLLMConfigured, getActiveProvider } from '@/lib/data/sources/llm';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
import {
  isTushareConfigured,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
  fetchTushareIncome,
} from '@/lib/data/sources/tushare-cached';
import { PERSONAS, buildUserMessage, type StockContext, type PerspectiveResult } from '@/lib/data/personas';
import { resolveLlm } from '@/lib/llm/resolve';
import { checkQuota, recordUsage } from '@/lib/billing/quota';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;
export const maxDuration = 60;  // Vercel function timeout

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const url = new URL(req.url);
  const personaFilter = url.searchParams.get('personas')?.split(',').filter(Boolean);

  if (!isLLMConfigured()) {
    return NextResponse.json({
      source: 'no-key',
      ticker,
      error: 'No LLM provider configured — set DEEPSEEK_API_KEY (preferred) or ANTHROPIC_API_KEY in Vercel env vars',
      perspectives: [],
    }, { status: 200 });
  }

  // BYO-key calls (user's own provider config) run unmetered; the shared
  // platform key is subject to the daily quota. Same fail-open rationale as
  // the copilot route: checkQuota() throws when signed out (this route has
  // no separate auth gate), so an auth failure here degrades to "unmetered"
  // rather than breaking the endpoint.
  const llm = await resolveLlm();
  const byo = llm?.source === 'user';
  let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;
  if (!byo) {
    try {
      quota = await checkQuota('perspectives');
    } catch {
      quota = null;
    }
  }
  if (quota && !quota.allowed) {
    // Field names mirror the no-key degradation shape above so the client
    // can share one "no perspectives, here's why" rendering path.
    return NextResponse.json({
      source: 'quota',
      ticker,
      error: '今日平台额度已用完',
      perspectives: [],
      quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
    }, { status: 200 });
  }

  const provider = getActiveProvider();

  // 1. Gather context
  const quote = await fetchEastmoneyQuote(ticker).catch(() => null);
  if (!quote) {
    return NextResponse.json(
      { source: 'no-quote', ticker, error: 'Cannot fetch quote', perspectives: [] },
      { status: 502 }
    );
  }

  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);
  let dailyBasic: any = null;
  let finaIndicator: any = null;
  let income: any[] = [];

  if (isA && isTushareConfigured()) {
    [dailyBasic, finaIndicator, income] = await Promise.all([
      fetchTushareDailyBasic(ticker).catch(() => null),
      fetchTushareFinaIndicator(ticker).catch(() => null),
      fetchTushareIncome(ticker, 5).catch(() => []),
    ]);
  }

  let financialSummary: string | undefined;
  if (income.length > 0) {
    const reversed = [...income].reverse();
    const rows = reversed.map((r) =>
      `${r.end_date.slice(0,4)}: 营收 ${(r.revenue/1e8).toFixed(0)}亿, 净利 ${(r.n_income/1e8).toFixed(0)}亿`
    );
    financialSummary = rows.join(' | ');
  }

  const ctx: StockContext = {
    ticker,
    name: quote.name,
    market: quote.market,
    currency: quote.currency,
    price: quote.price,
    change_pct: quote.change_pct,
    pe_ttm: dailyBasic?.pe_ttm ?? quote.pe_ttm ?? null,
    pb: dailyBasic?.pb ?? quote.pb ?? null,
    roe: finaIndicator?.roe ?? null,
    market_cap_label: quote.market_cap_label,
    dividend_yield: dailyBasic?.dv_ratio ?? null,
    gross_margin: finaIndicator?.grossprofit_margin ?? null,
    net_margin: finaIndicator?.netprofit_margin ?? null,
    financial_summary: financialSummary,
  };

  // 2. Run all 9 personas in parallel through the unified LLM facade
  const enabled = personaFilter && personaFilter.length > 0
    ? PERSONAS.filter((p) => personaFilter.includes(p.id))
    : PERSONAS;

  const userMessage = buildUserMessage(ctx);
  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let usedModel = '';

  const settled = await Promise.allSettled(
    enabled.map(async (p): Promise<PerspectiveResult | null> => {
      const resp = await chat({
        system: p.prompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 400,
        temperature: 0.7,
        timeoutMs: 30_000,
        responseJson: true,  // DeepSeek honors this; Anthropic ignores gracefully
      });
      totalInputTokens += resp.usage.input_tokens;
      totalOutputTokens += resp.usage.output_tokens;
      totalCost += resp.est_cost_usd;
      usedModel = resp.model;

      const parsed = extractJson(resp.content);
      if (!parsed) return null;

      const stance = (['bullish', 'neutral', 'bearish'] as const).includes(parsed.stance)
        ? parsed.stance
        : 'neutral';
      const confidence = Math.max(0, Math.min(10, Number(parsed.confidence) || 5));
      const summary = String(parsed.summary || '').slice(0, 300);
      const cites = Array.isArray(parsed.cites) ? parsed.cites.slice(0, 6).map(String) : [];

      return {
        persona: p.id,
        name: p.name,
        stance,
        confidence,
        summary,
        cites,
      };
    })
  );

  const perspectives = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((p): p is PerspectiveResult => p !== null);

  // Collect any error messages for debugging
  const failures = settled
    .map((s, i) => (s.status === 'rejected' ? { persona: enabled[i].id, err: (s.reason as any)?.message || String(s.reason) } : null))
    .filter(Boolean);

  await recordUsage('perspectives', {
    ticker,
    tokensIn: totalInputTokens,
    tokensOut: totalOutputTokens,
    byo,
  });

  return NextResponse.json({
    source: `${provider}+eastmoney` + (isA && isTushareConfigured() ? '+tushare' : ''),
    ticker,
    context: ctx,
    perspectives,
    meta: {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      provider,
      model: usedModel,
      personas_attempted: enabled.length,
      personas_succeeded: perspectives.length,
      tokens: { input: totalInputTokens, output: totalOutputTokens },
      est_cost_usd: Number(totalCost.toFixed(5)),
      failures: failures.length > 0 ? failures.slice(0, 3) : undefined,
    },
  });
}
