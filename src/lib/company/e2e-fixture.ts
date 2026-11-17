// Synthetic layout data, not facts. Only the two explicit tickers bypass the page loader;
// API routes have no fixture mode and must be intercepted by the browser spec.
import type {CompanyPageData} from './page-data';
import type {CoverageRow} from './types';
import {streamOptions} from './header-model';
export const COMPANY_FIXTURE_US='ffffffff-0000-4000-8000-000000000001';
export const COMPANY_FIXTURE_CN='ffffffff-0000-4000-8000-000000000002';
/** Fails closed (Codex task20 P2): only an isolated local test server — flag on, not production, not Vercel, no Supabase credentials. */
export const companyFixtureMode=(env:Record<string,string|undefined>=process.env)=>env.COMPANY_E2E_FIXTURES==='1'&&env.NODE_ENV!=='production'&&!env.VERCEL
 &&!env.NEXT_PUBLIC_SUPABASE_URL&&!env.SUPABASE_SERVICE_ROLE_KEY;
export function fixtureCompanyPageData(ticker:string,today:string):CompanyPageData|null {
 if(ticker!=='FIXT'&&ticker!=='999999.SH')return null;
 const market=ticker==='FIXT'?'US':'CN';
 const issuer={issuer_id:market==='US'?COMPANY_FIXTURE_US:COMPANY_FIXTURE_CN,status:'active',names:{zh:market==='US'?'夹具公司':'境内夹具公司',en:market==='US'?'Fixture Corp':'CN Fixture Corp'},identifiers:{cik:null,lei:null,usci:null},
  securities:[{ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:null,valid_to_method:null}]};
 const coverage:CoverageRow={issuer_id:issuer.issuer_id,market,filings_count:1,facts_count:1,concepts_covered:1,earliest_period_end:'2024-12-31',latest_period_end:'2024-12-31',latest_available_date:'2025-03-01',citation_summary:{linked:0,pending:market==='CN'?1:0,edgar:market==='US'?1:0},scope_last_success_at:'2025-03-01T00:00:00Z',scope_last_status:'success',based_on_rev:1,rebuilt_at:'2025-03-01T00:00:00Z',rebuild_id:'fixture',rebuild_batch_id:'fixture'};
 return {ticker,today,issuer,market,publicTicker:ticker,coverage,coverageAll:[coverage],streams:streamOptions(issuer,[coverage]),factState:'ok',errorCode:null};
}
