import { NextResponse } from 'next/server';
import { isAnthropicConfigured, anthropicChat, extractJson } from '@/lib/data/sources/anthropic';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
import {
  isTushareConfigured,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
  fetchTushareIncome,
} from '@/lib/data/sources/tushare';
import { PERSONAS, buildUserMessage, type StockContext, type PerspectiveResult } from '@/lib/data/personas';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;  // cache 24h per ticker

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const url = new URL(req.url);
  const personaFilter = url.searchParams.get('personas')?.split(',').filter(Boolean);

  if (!isAnthropicConfigured()) {
    return NextResponse.json({
      source: 'no-key',
      ticker,
      error: 'ANTHROPIC_API_KEY not configured — add to Vercel env vars to enable AI committee',
      perspectives: [],
    }, { status: 200 });
  }

  // 1. Gather context: quote + financials
  const quote = await fetchEastmoneyQuote(ticker).catch(() => null);
  if (!quote) {
    return NextResponse.json(
      { source: 'no-quote', ticker, error: 'Cannot fetch quote', perspectives: [] },
      { status: 502 }
    );
  }

  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);
  let dailyBasic = null;
  let finaIndicator = null;
  let income: any[] = [];

  if (isA && isTushareConfigured()) {
    [dailyBasic, finaIndicator, income] = await Promise.all([
      fetchTushareDailyBasic(ticker).catch(() => null),
      fetchTushareFinaIndicator(ticker).catch(() => null),
      fetchTushareIncome(ticker, 5).catch(() => []),
    ]);
  }

  // Build financial summary string for prompt
  let financialSummary: string | undefined;
  if (income.length > 0) {
    const reversed = [...income].reverse(); // oldest first
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

  // 2. Run all 9 personas in parallel
  const enabled = personaFilter && personaFilter.length > 0
    ? PERSONAS.filter((p) => personaFilter.includes(p.id))
    : PERSONAS;

  const userMessage = buildUserMessage(ctx);
  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const settled = await Promise.allSettled(
    enabled.map(async (p): Promise<PerspectiveResult | null> => {
      const resp = await anthropicChat({
        model: 'claude-sonnet-4-6',
        system: p.prompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 400,
        temperature: 0.7,
        timeoutMs: 25_000,
      });
      totalInputTokens += resp.usage.input_tokens;
      totalOutputTokens += resp.usage.output_tokens;

      const parsed = extractJson(resp.content);
      if (!parsed) return null;

      // Normalize
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
    .map((s, i) => (s.status === 'fulfilled' ? s.value : null))
    .filter((p): p is PerspectiveResult => p !== null);

  // Estimate cost (sonnet pricing)
  const estCost = (totalInputTokens / 1e6) * 3 + (totalOutputTokens / 1e6) * 15;

  return NextResponse.json({
    source: 'anthropic+eastmoney' + (isA && isTushareConfigured() ? '+tushare' : ''),
    ticker,
    context: ctx,
    perspectives,
    meta: {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      personas_attempted: enabled.length,
      personas_succeeded: perspectives.length,
      tokens: { input: totalInputTokens, output: totalOutputTokens },
      est_cost_usd: Number(estCost.toFixed(4)),
    },
  });
}
