/**
 * WP-A4 orchestration: dispatch in-scope companies to the collector for
 * their home market, isolate every failure to its source's receipt, and
 * audit the run. Never throws for a source failure.
 */
import { audit, type ResearchCtx } from '../../store';
import type { EntityKeysRow } from '../../entity-keys/store';
import { collectCninfo } from './cninfo';
import { collectEdgar } from './edgar';
import { collectHkexnews } from './hkexnews';
import type { CollectOptions, CollectReceipt, Collector, CollectorCompany, CollectorSource } from './types';

export const COLLECTORS: Record<CollectorSource, Collector> = { edgar: collectEdgar, cninfo: collectCninfo, hkexnews: collectHkexnews };
export const SOURCE_MARKET: Record<CollectorSource, CollectorCompany['home_market']> = { edgar: 'US', cninfo: 'A', hkexnews: 'HK' };
const ORDER: CollectorSource[] = ['edgar','cninfo','hkexnews'];

export interface CollectAllOptions extends Omit<CollectOptions, 'ctx'> { ctx: ResearchCtx; sources?: CollectorSource[] }
export interface CollectAllResult { receipts: CollectReceipt[]; ok: boolean }

/** In-scope companies from the entity table, with their primary exchange codes. */
export function companiesFromEntityKeys(rows: EntityKeysRow[]): CollectorCompany[] {
  return rows.filter(r => r.in_scope).map(r => ({
    entity_id: r.entity_id, names_en: r.names_en, names_zh: r.names_zh, home_market: r.home_market as CollectorCompany['home_market'],
    cik: r.keys.cik ?? null, cninfo_org_id: r.keys.cninfo_org_id ?? null,
    exchange_codes: r.securities.filter(s => s.is_primary && !s.valid_to).map(s => s.exchange_code),
  }));
}

export async function collectAll(opts: CollectAllOptions, collectors: Record<CollectorSource, Collector> = COLLECTORS): Promise<CollectAllResult> {
  const sources = ORDER.filter(s => !opts.sources || opts.sources.includes(s));
  const receipts: CollectReceipt[] = [];
  for (const source of sources) {
    const companies = opts.companies.filter(c => c.home_market === SOURCE_MARKET[source]);
    const started = (opts.now ?? (() => new Date()))().toISOString();
    try {
      receipts.push(await collectors[source]({ ...opts, companies }));
    } catch (e) {
      receipts.push({ source, started_at: started, finished_at: (opts.now ?? (() => new Date()))().toISOString(), companies: companies.length, fetched: 0, inserted: 0, duplicates: 0, versioned: 0, skipped: 0,
        failures: [{ company: null, stage: 'list', message: e instanceof Error ? e.message : String(e) }], ok: false });
    }
  }
  const ok = receipts.every(r => r.ok);
  await audit(opts.ctx, 'collect.run', null, { since: opts.since, until: opts.until ?? null, sources, ok, receipts });
  return { receipts, ok };
}
