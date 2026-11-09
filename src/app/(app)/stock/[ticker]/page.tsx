// src/app/(app)/stock/[ticker]/page.tsx
// Company page entry (plan 2026-11-06 Task 11; spec §5.1): server component. Resolves the issuer and
// its coverage once on the server, parses view/asOf, and hands everything to the client shell.
// Identity no longer comes from getStockOrStub(); quote row, K-line and quote ratios are removed (decision J).
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getAnonSupabase } from '@/lib/supabase/anon';
import { supabaseTableClient } from '@/lib/db/table-client';
import { supabaseCompanyDb } from '@/lib/company/db';
import { loadCompanyPageData, universeCandidates, type CompanyPageData } from '@/lib/company/page-data';
import { parseAsOf, parseView } from '@/lib/company/client';
import { requireAdminUser } from '@/lib/admin/auth';
import { parseFocus } from '@/components/company/focus-target';
import { CompanyPage } from './CompanyPage';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

async function isAdminViewer(): Promise<boolean> {
  try { await requireAdminUser(); return true; } catch { return false; }
}

/** Spec §5.7 "未知 ticker": no issuer AND not a known security → the framework 404 (stocks_universe is public-read). Fails open. */
async function knownSecurity(anon: ReturnType<typeof getAnonSupabase>, ticker: string): Promise<boolean> {
  try {
    const { data, error } = await anon.from('stocks_universe').select('ticker').in('ticker', universeCandidates(ticker)).limit(1);
    return error ? true : (data?.length ?? 0) > 0;
  } catch { return true; }
}

async function loadEntryData(ticker: string, today: string): Promise<CompanyPageData> {
  let anon: ReturnType<typeof getAnonSupabase>;
  try {
    anon = getAnonSupabase();
  } catch {
    // Client initialization precedes the loader's error boundary. Use the same unavailable
    // state when public-read configuration is absent; never invent an issuer or quote fallback.
    console.error('[company/page] Anonymous data client unavailable');
    return { ticker, today, issuer: null, market: null, publicTicker: null, coverage: null,
      coverageAll: [], streams: [], factState: 'no_issuer', errorCode: 'internal' };
  }
  const company = supabaseCompanyDb(anon);
  const data = await loadCompanyPageData({ tables: supabaseTableClient(anon), coverageOf: (ids) => company.coverageOf(ids) }, ticker, today);
  if (!data.issuer && !data.errorCode && !(await knownSecurity(anon, ticker))) notFound();
  return data;
}

export default async function StockPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<Search> }) {
  const [{ ticker: raw }, query] = await Promise.all([params, searchParams]);
  let ticker = raw;
  try { ticker = decodeURIComponent(raw); } catch { /* keep raw */ }
  const today = new Date().toISOString().slice(0, 10);
  const [data, isAdmin, locale] = await Promise.all([
    loadEntryData(ticker, today),
    isAdminViewer(),
    getLocale(),
  ]);
  const highlight = typeof query.highlight === 'string' && /^[0-9a-f-]{36}$/i.test(query.highlight) ? query.highlight : null;
  return (
    <CompanyPage
      data={data}
      view={parseView(query.view)}
      asOf={parseAsOf(query.asOf, today)}
      highlight={highlight}
      focus={parseFocus(query)}
      isAdmin={isAdmin}
      locale={locale === 'en' ? 'en' : 'zh'}
    />
  );
}
