import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {describe,expect,it} from 'vitest';
import en from '../../../messages/en/company.json';
import zh from '../../../messages/zh/company.json';
import enMarket from '../../../messages/en/market.json';
import zhMarket from '../../../messages/zh/market.json';
import enTracking from '../../../messages/en/tracking.json';
import zhTracking from '../../../messages/zh/tracking.json';
import type {CompanyPageData} from '@/lib/company/page-data';
import type {CoverageRow} from '@/lib/company/types';
import {CompanyHeader} from './CompanyHeader';

// Synthetic public coverage inputs, rendered by the real header and translations.
// Static rendering runs no effects, fetches, live probes or writes.
const coverage=(overrides:Partial<CoverageRow>={}):CoverageRow=>({
 issuer_id:'test-issuer',market:'US',filings_count:1,facts_count:1,concepts_covered:1,
 earliest_period_end:'2025-09-30',latest_period_end:'2025-09-30',latest_available_date:'2025-10-31',
 citation_summary:{linked:0,pending:0,edgar:1},scope_last_success_at:'2026-11-02T03:00:00Z',
 scope_last_status:'failed',based_on_rev:1,rebuilt_at:'2026-11-08T00:00:00Z',rebuild_id:'test',rebuild_batch_id:'test',...overrides,
});
function render(locale:'en'|'zh',cov:CoverageRow|null){
 const data:CompanyPageData={
  ticker:'TEST',publicTicker:'TEST',today:'2026-11-08',market:'US',
  issuer:{issuer_id:'test-issuer',status:'active',names:{en:'Test issuer',zh:null},identifiers:{cik:null,lei:null,usci:null},securities:[]},
  coverage:cov,coverageAll:cov?[cov]:[],streams:[],factState:cov?'ok':'no_facts',errorCode:null,
 };
 return renderToStaticMarkup(createElement(NextIntlClientProvider,{
  locale,timeZone:'UTC',messages:{company:locale==='en'?en:zh,market:locale==='en'?enMarket:zhMarket,tracking:locale==='en'?enTracking:zhTracking},
  children:createElement(CompanyHeader,{data,view:'overview',asOf:null,locale}),
 }));
}
const pair=(html:string,label:string)=>[...html.matchAll(/<div\b[^>]*><span\b[^>]*>([^<]*)<\/span>([\s\S]*?)<\/div>/g)].find(m=>m[1]===label)?.[2];

for(const locale of ['en','zh'] as const){
 const t=(locale==='en'?en:zh).header;
 describe(`rendered company sync dates (${locale})`,()=>{
  it('labels the retained success date as success and reports failure without a failure date',()=>{
   const html=render(locale,coverage());
   expect(pair(html,t.lastSync)).toContain('2026-11-02');
   expect(html).toContain(t.lastSyncFailed);
   expect(pair(html,t.lastSyncFailed)).toBeUndefined();
   expect(pair(html,t.latestPeriod)).toContain('2025-09-30');
   expect(pair(html,t.latestFiling)).toContain('2025-10-31');
   expect(pair(html,t.citations)).toContain('edgar 1');
  });
  it.each(['success',null] as const)('keeps the last-success date with status %s without inventing a failure',status=>{
   const html=render(locale,coverage({scope_last_status:status}));
   expect(pair(html,t.lastSync)).toContain('2026-11-02');
   expect(html).not.toContain(t.lastSyncFailed);
  });
  it.each(['failed','success',null] as const)('keeps an unavailable success date unavailable with status %s',status=>{
   const html=render(locale,coverage({scope_last_status:status,scope_last_success_at:null,latest_period_end:null,latest_available_date:null}));
   expect(pair(html,t.lastSync)).toContain(t.none);
   expect(pair(html,t.latestPeriod)).toContain(t.none);
   expect(pair(html,t.latestFiling)).toContain(t.none);
   expect(html.includes(t.lastSyncFailed)).toBe(status==='failed');
   expect(html).not.toContain('2026-11-08');
  });
  it('keeps absent coverage unavailable without fabricating sync state',()=>{
   const html=render(locale,null);
   expect(html).toContain(t.noFacts);
   expect(pair(html,t.lastSync)).toBeUndefined();
   expect(html).not.toContain(t.lastSyncFailed);
  });
 });
}
