import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import company from '../../../messages/en/company.json';
import research from '../../../messages/en/research.json';
import {DisclosureDrawer,WithheldDrawer} from './DisclosureDrawer';
import {StatementsView} from './StatementsView';
import {MiniBars} from './MiniBars';
import {barSeries} from './statements-model';
import type {GridRow,PeriodCol} from '@/lib/company/types';
const {response}=vi.hoisted(()=>({response:{data:null as unknown}}));
vi.mock('./useCompanyFetch',()=>({useCompanyFetch:()=>({state:{status:'ok',data:response.data},retry:()=>{}})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:()=>{}})}));
const render=(child:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{company,research},children:child}));
const period:PeriodCol={key:'2024-01-01|2024-12-31|12M',periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M'};
const row:GridRow={concept:'revenue',unit:'CNY',unitKind:'money',sourceConcepts:[],notes:null,cells:{[period.key]:{kind:'withheld',reason:'citation_pending',factId:'hidden',value:'987654321'} as never}};
it('renders withheld statement cells as badges without the fixture value',()=>{
 response.data={issuerId:'i',ticker:'600519.SH',market:'CN',asOf:null,statement:'IS',basis:'disclosed',periods:[period],rows:[row],filings:{},otherUnitOnly:{},otherUnitsAlso:{},withheld:{citationPending:1,evidenceIncomplete:0},mappingGen:1,stateRev:1,truncated:false};
 const html=render(createElement(StatementsView,{ticker:'600519.SH',asOf:null,isAdmin:false,adminView:false,onAdminView:()=>{},highlight:null}));expect(html).toContain('data-research-state="withheld"');expect(html).not.toContain('987654321');
});
it('renders shared sections and keeps disclosure evidence test ids',()=>{
 response.data={ticker:'AAPL',issuerId:'i',market:'US',concept:'revenue',unit:'USD',series:[{kind:'fact',factId:'f',value:'123',unit:'USD',sourceConcept:'Revenues',filingId:'g',availableDate:'2025-01-01',mappingVersion:'map',mappingGen:1,disclosureSeq:1,isCurrent:true,isRevision:false,delta:null,relChange:null}],otherUnitSeries:[],filings:{},evidence:{},truncated:false};
 const html=render(createElement(DisclosureDrawer,{ticker:'AAPL',asOf:null,admin:false,target:{kind:'history',key:{concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',unit:'USD'},duration:'12M',otherUnits:false,scaleExp:0},onClose:()=>{}}));
 for(const section of ['identity','source','times','transform','licence','links'])expect(html).toContain(`data-drawer-section="${section}"`);
 for(const id of ['drawer-available-date','drawer-transform-chain','drawer-code-version'])expect(html).toContain(`data-testid="${id}"`);
 expect(html).toContain('aria-pressed="true"');expect(html).not.toContain('<table');
});
it('withheld drawer has identity and reason only',()=>{const html=render(createElement(WithheldDrawer,{title:'Revenue',id:'revenue|period|CNY',reason:'citation_pending',onClose:()=>{}}));expect(html).toContain('data-drawer-section="identity"');expect(html).not.toContain('data-drawer-section="source"');});
it('MiniBars draws missing and withheld periods as dashed placeholders, not value bars',()=>{
 const series=barSeries({...row,cells:{...row.cells,missing:null}},[period,{...period,key:'missing'}]);
 expect(series.map(s=>s.value)).toEqual([null,null]);
 const html=renderToStaticMarkup(createElement(MiniBars,{series,label:'Revenue'}));
 expect(html.match(/stroke-dasharray="3 3"/g)).toHaveLength(2);expect(html).not.toContain('fill="var(--accent)"');expect(html).not.toContain('height="0"');
});
