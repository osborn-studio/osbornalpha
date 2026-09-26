/** Shared collector plumbing: polite fetch, receipts, and versioned writes. */
import { ingestVersioned } from './write';
import type { IngestSourceInput } from '../../sources';
import type { CollectFailure, CollectOptions, CollectReceipt, CollectorCompany, CollectorSource } from './types';

export const DEFAULT_USER_AGENT = 'OsbornAlpha research osbornhello@gmail.com';

export interface Client {
  get(url: string, headers?: Record<string, string>): Promise<Response>;
  post(url: string, body: string, headers?: Record<string, string>): Promise<Response>;
}

/** One client per collector run: declares the User-Agent and keeps at least minIntervalMs between requests. */
export function createClient(opts: CollectOptions, defaultIntervalMs: number): Client {
  const doFetch = opts.fetch ?? fetch;
  const ua = opts.userAgent ?? process.env.EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT;
  const gap = opts.minIntervalMs ?? defaultIntervalMs;
  let last = 0;
  const pace = async () => { const wait = last + gap - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now(); };
  const call = async (url: string, init: RequestInit) => {
    await pace();
    return doFetch(url, { ...init, headers: { 'User-Agent': ua, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(30_000) });
  };
  return {
    get: (url, headers) => call(url, { method: 'GET', headers }),
    post: (url, body, headers) => call(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } }),
  };
}

export class Receipt {
  readonly r: CollectReceipt;
  constructor(source: CollectorSource, companies: number, private readonly clock: () => Date) {
    this.r = { source, started_at: clock().toISOString(), finished_at: '', companies, fetched: 0, inserted: 0, duplicates: 0, versioned: 0, skipped: 0, lookups: 0, failures: [], ok: true };
  }
  fail(f: CollectFailure) { this.r.failures.push(f); this.r.ok = false; }
  finish(): CollectReceipt { this.r.finished_at = this.clock().toISOString(); return this.r; }
}

export const companyName = (c: CollectorCompany) => c.names_en[0] ?? c.names_zh[0] ?? c.entity_id;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const isoDate = (iso: string) => iso.slice(0, 10);

/** Write one document through the versioned path and account for it on the receipt. */
export async function writeDocument(opts: CollectOptions, receipt: Receipt, company: CollectorCompany, input: Omit<IngestSourceInput, 'source_version'>) {
  try {
    const res = await ingestVersioned(opts.ctx, input);
    if (res.duplicate) receipt.r.duplicates++; else { receipt.r.inserted++; if (res.versioned) receipt.r.versioned++; }
  } catch (e) {
    receipt.fail({ company: companyName(company), stage: 'ingest', message: errorMessage(e), url: input.url ?? undefined });
  }
}

/** Inclusive-start, exclusive-end window on an ISO instant. */
export function inWindow(iso: string, since: string, until?: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= Date.parse(since) && (until === undefined || t < Date.parse(until));
}

/** Calendar date (YYYY-MM-DD) of an ISO instant in a fixed UTC offset, for date-only upstream queries (UTC+8 for 巨潮 and HKEX). */
export function localDate(iso: string, offsetHours: number): string {
  return new Date(Date.parse(iso) + offsetHours * 3600_000).toISOString().slice(0, 10);
}
