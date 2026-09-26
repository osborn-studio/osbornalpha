/**
 * 巨潮资讯 collector: topSearch resolves the orgId a code needs, then
 * hisAnnouncement/query lists announcements (PDF links). Unofficial endpoint:
 * one request every 500 ms, declared User-Agent, title + metadata only.
 */
import { companyName, createClient, errorMessage, inWindow, isoDate, Receipt, writeDocument, type Client } from './shared';
import type { CollectOptions, CollectReceipt } from './types';

export const CNINFO_TOPSEARCH = 'http://www.cninfo.com.cn/new/information/topSearch/query';
export const CNINFO_HISTORY = 'http://www.cninfo.com.cn/new/hisAnnouncement/query';
const STATIC = 'http://static.cninfo.com.cn/';
const PAGE_SIZE = 30;

export interface OrgLookup { orgId: string; name: string; category: string }

async function topSearch(code: string, client: Client): Promise<OrgLookup | null> {
  const res = await client.post(CNINFO_TOPSEARCH, `keyWord=${encodeURIComponent(code)}&maxNum=10`);
  if (!res.ok) throw new Error(`cninfo ${res.status}`);
  const rows = await res.json() as Array<{ code?: string; orgId?: string; zwjc?: string; category?: string }>;
  const hit = Array.isArray(rows) ? rows.find(r => r.code === code && typeof r.orgId === 'string') : undefined;
  return hit ? { orgId: hit.orgId!, name: hit.zwjc ?? '', category: hit.category ?? '' } : null;
}

/** Exact-code orgId lookup, exposed for the A2 back-fill script. */
export async function resolveOrgId(code: string, opts: { fetch?: typeof fetch; userAgent?: string }): Promise<OrgLookup | null> {
  return topSearch(code, createClient({ ctx: null as never, companies: [], since: '', fetch: opts.fetch, userAgent: opts.userAgent, minIntervalMs: 0 }, 500));
}

const aShareCode = (codes: string[]) => codes.map(c => /^(\d{6})\.(SH|SZ)$/.exec(c)).find(Boolean) as RegExpExecArray | undefined;
const seDate = (since: string, until?: string) => `${isoDate(since)}~${isoDate(until ?? new Date().toISOString())}`;

interface Announcement { announcementId: string; announcementTitle: string; announcementTime: number; adjunctUrl: string; adjunctType?: string; secCode?: string; orgId?: string }

export async function collectCninfo(opts: CollectOptions): Promise<CollectReceipt> {
  const clock = opts.now ?? (() => new Date());
  const receipt = new Receipt('cninfo', opts.companies.length, clock);
  const client = createClient(opts, 500);
  const cap = opts.maxPerCompany ?? 50;
  for (const company of opts.companies) {
    const m = aShareCode(company.exchange_codes);
    if (!m) { receipt.r.skipped++; continue; }
    const code = m[1], column = m[2] === 'SH' ? 'sse' : 'szse';
    let orgId = company.cninfo_org_id;
    if (!orgId) {
      receipt.r.lookups!++;
      try {
        const hit = await topSearch(code, client);
        if (!hit) throw new Error(`no exact orgId match for ${code}`);
        orgId = hit.orgId;
      } catch (e) { receipt.fail({ company: companyName(company), stage: 'lookup', message: errorMessage(e), url: CNINFO_TOPSEARCH }); continue; }
    }
    let taken = 0;
    for (let pageNum = 1; taken < cap; pageNum++) {
      const body = new URLSearchParams({ pageNum: String(pageNum), pageSize: String(PAGE_SIZE), column, tabName: 'fulltext', plate: '', stock: `${code},${orgId}`, searchkey: '', secid: '', category: '', trade: '',
        seDate: seDate(opts.since, opts.until), sortName: '', sortType: '', isHLtitle: 'true' }).toString();
      let page: { announcements?: Announcement[] | null; hasMore?: boolean };
      try {
        const res = await client.post(CNINFO_HISTORY, body);
        if (!res.ok) throw new Error(`cninfo ${res.status}`);
        page = await res.json();
      } catch (e) { receipt.fail({ company: companyName(company), stage: 'list', message: errorMessage(e), url: CNINFO_HISTORY }); break; }
      const list = page.announcements ?? [];
      for (const a of list) {
        if (taken >= cap) break;
        const eventTime = new Date(a.announcementTime).toISOString();
        const beijingDate = isoDate(new Date(a.announcementTime + 8 * 3600_000).toISOString()); // announcementTime is Beijing midnight
        if (!inWindow(eventTime, opts.since, opts.until && `${isoDate(opts.until)}T23:59:59.999Z`)) continue;
        taken++; receipt.r.fetched++;
        const url = STATIC + a.adjunctUrl;
        const title = a.announcementTitle.replace(/<[^>]+>/g, '');
        await writeDocument(opts, receipt, company, {
          source_type: 'FILING', title, url, raw_text: `${title}\n公告类型：${a.adjunctType ?? 'PDF'}\n公告时间：${beijingDate}\n证券代码：${a.secCode ?? code}\n原文：${url}`,
          published_at: beijingDate, trust_level: 'HIGH', entity_ids: [company.entity_id], market: 'A', permission: 'public', origin_type: 'filing',
          event_time: eventTime, available_at: clock().toISOString(),
          metadata: { collector: 'cninfo', announcement_id: a.announcementId, sec_code: a.secCode ?? code, org_id: a.orgId ?? orgId, adjunct_type: a.adjunctType ?? null, document_url: url },
        });
      }
      // A short page is the last page even if the server still claims hasMore (observed on the live endpoint).
      if (!page.hasMore || list.length < PAGE_SIZE) break;
    }
  }
  return receipt.finish();
}
