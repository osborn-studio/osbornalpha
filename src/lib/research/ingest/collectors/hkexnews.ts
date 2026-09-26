/**
 * HKEXnews title search collector: prefix.do resolves the stockId, the JSF
 * title search returns an HTML table (release time HKT, code, headline,
 * title, PDF link). No official JSON; layout drift is reported, never thrown
 * past the receipt.
 */
import { companyName, createClient, errorMessage, inWindow, isoDate, localDate, Receipt, writeDocument } from './shared';
import type { CollectOptions, CollectReceipt } from './types';

export const HKEX_PREFIX = 'https://www1.hkexnews.hk/search/prefix.do';
export const HKEX_TITLESEARCH = 'https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=zh';
const BASE = 'https://www1.hkexnews.hk';

export interface HkexRow { released_at: string; stock_code: string; short_name: string; headline: string; title: string; document_url: string }

const decode = (s: string) => s.replace(/<span[^>]*class="mobile-list-heading"[^>]*>[\s\S]*?<\/span>/gi, '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** "03/09/2026 16:38" in Hong Kong time (UTC+8, no DST) → ISO UTC. */
export function hktToIso(text: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 8, +m[5])).toISOString();
}

export function parseTitleSearch(html: string): HkexRow[] {
  const tbody = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  if (!tbody) throw new Error('layout_changed: result table not found');
  const rows: HkexRow[] = [];
  for (const tr of tbody[1].split(/<tr[^>]*>/i).slice(1)) {
    const cell = (cls: string) => new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</td>`, 'i').exec(tr)?.[1];
    const released = hktToIso(decode(cell('release-time') ?? ''));
    const code = decode(cell('stock-short-code') ?? '');
    const name = decode(cell('stock-short-name') ?? '');
    const headline = decode(/<div[^>]*class="headline"[^>]*>([\s\S]*?)<\/div>/i.exec(tr)?.[1] ?? '');
    const link = /<div[^>]*class="doc-link"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(tr);
    if (!released || !link) continue;
    rows.push({ released_at: released, stock_code: code, short_name: name, headline, title: decode(link[2]), document_url: link[1].startsWith('http') ? link[1] : BASE + link[1] });
  }
  // Empty result pages keep the table shell and say 沒有找到訊息 (recorded 2026-09-26); anything else with no rows is layout drift.
  if (rows.length === 0 && !/沒有找到訊息|没有找到信息|No (?:matching )?records? found|沒有相關|没有相关/i.test(html)) throw new Error('layout_changed: no rows parsed');
  return rows;
}

const hkCode = (codes: string[]) => codes.map(c => /^(\d{4,5})\.HK$/.exec(c)?.[1]).find(Boolean);
// HKEX filters by Hong Kong calendar date (UTC+8); cover every date the UTC window touches, then filter by exact instant.
const yyyymmdd = (iso: string) => localDate(iso, 8).replace(/-/g, '');

export async function collectHkexnews(opts: CollectOptions): Promise<CollectReceipt> {
  const clock = opts.now ?? (() => new Date());
  const receipt = new Receipt('hkexnews', opts.companies.length, clock);
  const client = createClient(opts, 1000);
  const cap = opts.maxPerCompany ?? 50;
  for (const company of opts.companies) {
    const code = hkCode(company.exchange_codes);
    if (!code) { receipt.r.skipped++; continue; }
    receipt.r.lookups!++;
    let stockId: number;
    const lookupUrl = `${HKEX_PREFIX}?callback=callback&lang=ZH&type=A&name=${code}&market=SEHK`;
    try {
      const res = await client.get(lookupUrl);
      if (!res.ok) throw new Error(`hkex ${res.status}`);
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')) as { stockInfo?: Array<{ stockId: number; code: string }> };
      const hit = json.stockInfo?.find(s => Number(s.code) === Number(code));
      if (!hit) throw new Error(`no stockId for ${code}`);
      stockId = hit.stockId;
    } catch (e) { receipt.fail({ company: companyName(company), stage: 'lookup', message: errorMessage(e), url: lookupUrl }); continue; }
    let rows: HkexRow[];
    try {
      const body = new URLSearchParams({ lang: 'ZH', category: '0', market: 'SEHK', searchType: '1', documentType: '-1', t1code: '-2', t2Gcode: '-2', t2code: '-2', stockId: String(stockId),
        from: yyyymmdd(opts.since), to: yyyymmdd(opts.until ?? clock().toISOString()), 'MB-Daterange': '0', title: '' }).toString();
      const res = await client.post(HKEX_TITLESEARCH, body);
      if (!res.ok) throw new Error(`hkex ${res.status}`);
      rows = parseTitleSearch(await res.text());
    } catch (e) { receipt.fail({ company: companyName(company), stage: 'list', message: errorMessage(e), url: HKEX_TITLESEARCH }); continue; }
    let taken = 0;
    for (const row of rows) {
      if (taken >= cap) break;
      if (!inWindow(row.released_at, opts.since, opts.until)) continue;
      taken++; receipt.r.fetched++;
      await writeDocument(opts, receipt, company, {
        source_type: 'FILING', title: row.title, url: row.document_url, raw_text: `${row.title}\n類別：${row.headline}\n發放時間：${row.released_at}\n股份代號：${row.stock_code} ${row.short_name}\n原文：${row.document_url}`,
        published_at: isoDate(row.released_at), trust_level: 'HIGH', entity_ids: [company.entity_id], market: 'HK', permission: 'public', origin_type: 'filing',
        event_time: row.released_at, available_at: clock().toISOString(),
        metadata: { collector: 'hkexnews', stock_code: row.stock_code, short_name: row.short_name, headline: row.headline, document_url: row.document_url, stock_id: stockId },
      });
    }
  }
  return receipt.finish();
}
