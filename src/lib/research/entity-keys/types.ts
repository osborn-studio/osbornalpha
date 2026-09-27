/** WP-A2 entity keys (implementation plan 2026-09-22 §5.2). */
export const HOME_MARKETS = ['A','HK','US','other'] as const;
export type HomeMarket = typeof HOME_MARKETS[number];
export const KEY_NAMES = ['lei','usci','cninfo_org_id','cik'] as const;
export type KeyName = typeof KEY_NAMES[number];
export const SECURITY_TYPES = ['common','adr','preferred','other'] as const;
export type SecurityType = typeof SECURITY_TYPES[number];

/** Where a value came from and when; `ref` is a URL, file name or note. */
export interface Provenance { source: string; retrieved_at: string; ref?: string }

export interface CohortSecurity {
  exchange_code: string;            // 600570.SH / 0268.HK / PLTR
  mic: string | null;               // ISO 10383; null when unknown (owner-entered)
  isin: string | null;
  market: HomeMarket;
  security_type: SecurityType;
  is_primary: boolean;
  valid_from: string;               // listing date, YYYY-MM-DD
  valid_to?: string | null;
  provenance: Partial<Record<'isin' | 'exchange_code' | 'mic' | 'valid_from', Provenance>>;
}

export interface CohortCompany {
  names_en: string[];
  names_zh: string[];
  aliases: string[];
  home_market: HomeMarket;
  in_scope: boolean;
  cohort: string;
  keys: Partial<Record<KeyName, string | null>>;
  provenance: Partial<Record<KeyName, Provenance>>;
  missing: KeyName[];
  securities: CohortSecurity[];
}

export interface CohortFile { version: string; generated_at: string; companies: CohortCompany[] }
