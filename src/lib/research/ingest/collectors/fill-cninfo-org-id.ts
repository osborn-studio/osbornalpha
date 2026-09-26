/** WP-A4 helper for WP-A2: fill missing A-share cninfo orgIds from topSearch results. */
import type { CohortCompany } from '../../entity-keys/types';
import { CNINFO_TOPSEARCH, type OrgLookup } from './cninfo';

export interface ApplyResult { companies: CohortCompany[]; filled: string[]; unresolved: string[] }

export function applyOrgIds(companies: CohortCompany[], lookups: Record<string, OrgLookup>, retrievedAt: string): ApplyResult {
  const filled: string[] = [], unresolved: string[] = [];
  const out = companies.map(c => {
    if (c.home_market !== 'A' || c.keys.cninfo_org_id) return c;
    const primary = c.securities.find(s => s.is_primary)?.exchange_code ?? '';
    const code = /^(\d{6})\./.exec(primary)?.[1];
    const hit = code ? lookups[code] : undefined;
    if (!hit) { unresolved.push(primary); return c; }
    filled.push(primary);
    return { ...c, keys: { ...c.keys, cninfo_org_id: hit.orgId }, missing: c.missing.filter(m => m !== 'cninfo_org_id'),
      provenance: { ...c.provenance, cninfo_org_id: { source: 'web:cninfo.com.cn', retrieved_at: retrievedAt, ref: `${CNINFO_TOPSEARCH} keyWord=${code}` } } };
  });
  return { companies: out, filled, unresolved };
}
