import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {describe,expect,it,vi} from 'vitest';
import en from '../../../messages/en/company.json';
import zh from '../../../messages/zh/company.json';
import type {OverviewResponse} from '@/lib/company/client';
import {OverviewView} from './OverviewView';
const fixture=vi.hoisted(()=>({data:null as unknown}));
vi.mock('./useCompanyFetch',()=>({useCompanyFetch:()=>({state:{status:'ok',data:fixture.data},retry:()=>{}})}));
vi.mock('@/components/industries/IndustryRow',()=>({IndustryRow:()=>null}));
function render(locale:'en'|'zh',patch:Partial<NonNullable<OverviewResponse['latest']>>={},asOf:string|null='2026-05-01'){
 fixture.data={ticker:'NOAH',market:'US',asOf:'2026-05-01',coverage:null,coverageOtherMarket:null,latestFiling:null,eventsComputed:'materialized',evidence:{},withheld:{evidenceIncomplete:0,citationPending:0},latest:{periodKey:'2025-01-01:2025-12-31:12M',facts:{revenue:null,net_income_parent:null,operating_cash_flow:null},derived:{gross_margin:null,revenue_yoy:null},stateRev:1,truncated:false,...patch},recentEvents:[]} as OverviewResponse;
 return renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{company:locale==='en'?en:zh},children:createElement(OverviewView,{ticker:'NOAH',market:'US',asOf})}));
}
for(const locale of ['en','zh'] as const){
 const t=(locale==='en'?en:zh);
 describe(`overview presentation (${locale})`,()=>{
  it('explains only confirmed null fields with Statements navigation preserving asOf',()=>{
   const html=render(locale,{unavailableReasons:{facts:{revenue:'multiple_units'},derived:{revenue_yoy:'multiple_units'}}});
   expect(html.split(`>${t.overview.multipleUnits}</span>`)).toHaveLength(3);
   expect(html).toContain('href="/stock/NOAH?view=statements&amp;asOf=2026-05-01"');
   expect(html).toContain(t.overview.toStatements);
   expect(html.split(t.overview.multipleUnitsExplanation)).toHaveLength(2);
   expect(html.split('href="/stock/NOAH?view=statements')).toHaveLength(2);
   // The three genuinely missing cells retain their existing missing-data title.
   expect(html.split(t.statements.cellMissingTitle)).toHaveLength(4);
   expect(html).not.toMatch(/CNY|USD/);
  });
  it('supports older payloads with no reason and does not infer from all-null cells',()=>{
   const html=render(locale);expect(html).not.toContain(t.overview.multipleUnits);
   expect(html.split(t.statements.cellMissingTitle)).toHaveLength(6);
  });
  it('keeps withholding ahead of any stale reason and suppresses explanation on truncation',()=>{
   const patch={unavailableReasons:{facts:{revenue:'multiple_units' as const},derived:{}},facts:{revenue:{kind:'withheld' as const,reason:'citation_pending' as const,factId:'hidden'}}};
   const html=render(locale,patch);expect(html).toContain(t.statements.cellPending);expect(html).not.toContain(t.overview.multipleUnits);
   expect(render(locale,{...patch,truncated:true})).not.toContain(t.overview.multipleUnits);
  });
  it('preserves current-mode navigation without inventing an asOf',()=>{
   const html=render(locale,{unavailableReasons:{facts:{revenue:'multiple_units'},derived:{}}},null);
   expect(html).toContain('href="/stock/NOAH?view=statements"');
  });
 });
}
