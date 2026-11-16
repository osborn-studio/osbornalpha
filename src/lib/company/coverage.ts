// src/lib/company/coverage.ts
// issuer_coverage row of one (issuer, market) stream (spec §4.2, §6.3). Pure: counts and dates only,
// never a financial value (issuer_coverage stays public). facts_count = visible ok rows of the history
// envelope (one per disclosure); latest_available_date comes from the filings (zero-fact filings
// included); citation_summary counts FilingSummary.citation; scope_last_* are copied from
// fact_sync_scope (last_success_at / last_status) — no freshness status is stored (§4.2).
import type {FactRow,ScopeRow} from '@/lib/facts/types';
import type {CoverageInput,FilingSummary} from './types';

export type CoverageScope=Pick<ScopeRow,'last_success_at'|'last_status'>;
export function summarizeCoverage(input:{rows:FactRow[];filings:FilingSummary[];scope:CoverageScope|null}):CoverageInput{
 const rows=input.rows.filter(r=>r.status==='ok');
 const filings=input.filings.filter(f=>f.mappingGen>0);
 // DEI cover observations (e.g. shares outstanding) have observation dates, not reporting periods.
 // Keep them in fact/concept counts, but do not let them move the financial period range.
 const ends=rows.filter(r=>r.statement!=='DEI').map(r=>r.period_end).sort();
 const avail=filings.map(f=>f.availableDate).sort();
 const cite={linked:0,pending:0,edgar:0};
 for(const f of filings)cite[f.citation]++;
 return {filings_count:filings.length,facts_count:rows.length,concepts_covered:new Set(rows.map(r=>r.concept)).size,
  earliest_period_end:ends[0]??null,latest_period_end:ends[ends.length-1]??null,latest_available_date:avail[avail.length-1]??null,
  citation_summary:cite,scope_last_success_at:input.scope?.last_success_at??null,scope_last_status:input.scope?.last_status??null};
}
