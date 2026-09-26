import type { ResearchCtx } from '../../store';

export type CollectorSource = 'edgar' | 'cninfo' | 'hkexnews';

export interface CollectorCompany {
  entity_id: string;
  names_en: string[];
  names_zh: string[];
  home_market: 'A' | 'HK' | 'US' | 'other';
  cik: string | null;
  cninfo_org_id: string | null;
  /** 600570.SH / 0268.HK / PLTR */
  exchange_codes: string[];
}

export interface CollectOptions {
  ctx: ResearchCtx;
  companies: CollectorCompany[];
  /** ISO instant: only documents made available at or after this instant. */
  since: string;
  until?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  userAgent?: string;
  /** Per-company cap on documents per run (default 50). */
  maxPerCompany?: number;
  /** Minimum gap between requests to one host, ms (source default when omitted). */
  minIntervalMs?: number;
}

export interface CollectFailure { company: string | null; stage: 'lookup' | 'list' | 'document' | 'ingest'; message: string; url?: string }

export interface CollectReceipt {
  source: CollectorSource;
  started_at: string;
  finished_at: string;
  companies: number;
  fetched: number;
  inserted: number;
  duplicates: number;
  versioned: number;
  skipped: number;
  lookups?: number;
  failures: CollectFailure[];
  ok: boolean;
}

export type Collector = (opts: CollectOptions) => Promise<CollectReceipt>;
