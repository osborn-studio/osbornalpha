import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import zh from '../../../messages/zh/industries.json';
import en from '../../../messages/en/industries.json';
import researchZh from '../../../messages/zh/research.json';
import researchEn from '../../../messages/en/research.json';
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:()=>({cells:[]})}));
import {publicCell,runHeader} from '@/lib/industry/read';
import {cellRow,runRow} from '@/lib/industry/fixture-rows';
import {AGG_METRICS_US} from '@/lib/industry/method-us';
import {RunHeaderBar} from './RunHeaderBar';
import {ValuationSnapshot} from './ValuationSnapshot';
import {Heatmap} from './Heatmap';
import {CoverageCell} from './CoverageCell';
import {StateNotice} from './StateNotice';
import {adaptSourceDrawer} from './source-drawer-adapter';
import type {Translate} from './cell-text';
const cell=publicCell(cellRow({metric:'revenue_sum',n_members:2}));
const header=runHeader(runRow());
for(const locale of ['zh','en'] as const){
 const catalog=locale==='zh'?zh:en;
 const render=(children:ReactNode)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{industries:catalog,research:locale==='zh'?researchZh:researchEn},children}));
 const t:Translate=(key,values)=>{const s=key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],catalog) as string;return s.replace(/\{(\w+)\}/g,(_,k:string)=>String(values?.[k]??''));};
 it(locale+': run bar has distinct methods link and no history badge',()=>{
  const html=render(createElement(RunHeaderBar,{header,freshness:'fresh',methodsHref:'#methods'}));
  expect(html).toContain(locale==='zh'?'方法与来源':'Methods &amp; sources');
  expect(html).not.toContain('data-research-state="reconstructed"');
 });
 it(locale+': SIC unpublished valuations use the detail notice; SW keeps its copy',()=>{
  for(const state of ['not_enabled','unpublished'] as const){
   const props={nodes:[],block:{state,runId:header.runId,reconciliation:{}},preview:false,title:'title' as const};
   expect(render(createElement(ValuationSnapshot,{...props,scheme:'sic'}))).toContain('data-state="notPublished"');
   expect(render(createElement(ValuationSnapshot,{...props,scheme:'sw2021'}))).toContain('data-state="'+(state==='not_enabled'?'notEnabled':'partialUnpublished')+'"');
  }
 });
 it(locale+': metric identity and concept are localized while evidence retains raw key',()=>{
  const a=adaptSourceDrawer({kind:'aggregate',scheme:'sic',code:cell.code,nodeName:'Industry',cell,header,preview:false},locale,t);
  if(a?.variant!=='ok')throw Error('expected ok');
  expect(a.payload.identity.label).toContain(catalog.metrics.revenue_sum);
  expect(a.extras?.title).toContain(catalog.metrics.revenue_sum);
  expect(a.extras?.rows?.source?.find(r=>r.key==='cell')?.value).toBe(catalog.metrics.revenue_sum);
  expect(a.payload.identity.id).toContain('revenue_sum');
  expect(a.payload.source.locator).toContain('revenue_sum');
 });
 it(locale+': SIC formulas exactly cover US metrics and use annual gross profit',()=>{
  expect(Object.keys(catalog.formulasSic).sort()).toEqual([...AGG_METRICS_US].sort());
  for(const metric of AGG_METRICS_US)expect((catalog.formulasSic as Record<string,string>)[metric]).toEqual(expect.stringMatching(/^(?!.*(?:quarterly|单季|roe|ttm)).+$/i));
  expect(catalog.formulasSic.gross_margin).toBe(locale==='zh'?'Σ 毛利 / Σ 营收':'Σ gross profit / Σ revenue');
 });
 it(locale+': non-US SIC metrics fall back to generic formulas',()=>{
  const a=adaptSourceDrawer({kind:'aggregate',scheme:'sic',code:cell.code,nodeName:'Industry',cell:{...cell,metric:'roe'},header,preview:false},locale,t);
  expect(a?.variant==='ok'&&a.extras?.rows?.transform?.find(r=>r.key==='formula')?.value).toBe(catalog.formulas.roe);
 });
 it(locale+': phone heatmap hides details, table retains them',()=>{
  const c={...cell,display:'members' as const};
  const html=render(createElement(Heatmap,{scheme:'sic',nodes:[{code:cell.code,level:1,nameZh:'行业',nameEn:'Industry',parentCode:null}],periodEnds:[cell.periodEnd],cells:[c],metric:c.metric,header,preview:false,tableHref:'?view=table'}));
  const button=html.match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0]??'';
  expect(button).toMatch(/aria-label="[^"]*(?:成分不足|too few members)/);
  expect(button).toMatch(/title="[^"]*(?:成分不足|too few members)/);
  const mobile=button.split('class="sm:hidden">')[1]?.split('<span class="hidden sm:inline">')[0]??'';
  expect(mobile).toContain('data-research-state="lowCoverage"');
  expect(mobile).not.toMatch(/成分不足|too few members|2&lt;5/);
  expect(button).toContain('hidden sm:inline');
  expect(html).toContain('sm:hidden');
  expect(html).toContain(locale==='zh'?'成分不足':'too few');
  expect(render(createElement(CoverageCell,{cell:c,metric:c.metric}))).not.toContain('hidden sm:inline');
 });
 it(locale+': current-only copy retains observation rule without obsolete aggregate claim or repeated body',()=>{
  expect(catalog.states.currentOnly.body).not.toMatch(/不做聚合|not aggregated/);
  const html=render(createElement(StateNotice,{kind:'currentOnly'}));
  expect(html).not.toContain('<details');
  const page=readFileSync('src/app/(app)/intel/industries/[scheme]/[code]/constituents/page.tsx','utf8');
  expect(page.match(/kind="currentOnly"/g)).toHaveLength(1);
 });
}
