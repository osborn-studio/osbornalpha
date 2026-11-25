import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import zh from '../../../../messages/zh/industries.json';
import en from '../../../../messages/en/industries.json';
import zhResearch from '../../../../messages/zh/research.json';
import enResearch from '../../../../messages/en/research.json';
import {VendorDrawer} from './VendorDrawer';
import type {RunHeader,VendorCell,VendorSource} from '@/lib/industry/vendor/page-read';
import {vendorCellPayload,vendorMembershipPayload,vendorReplayUrl,readReplayResult} from '../drawer-model';
import {adaptVendorDrawer} from '../source-drawer-adapter';

const t=(key:string)=>key;
const header:RunHeader={runId:'fixture-a',kind:'financials',gridSize:{codes:1,periods:1},generation:1,activatedAt:'2091-04-07',fetchedFrom:'2091-04-05',fetchedTo:'2091-04-06',
 parserVersion:'synthetic-parser',mappingVersion:'synthetic-mapping',codeVersion:'synthetic-build',contentHash:'abc',datasetKey:'fixture',origin:'vendor_reported',historyClass:'reconstruction'};
const source:VendorSource={vendor:'synthetic',product:'fixture-product',interface:'fixture-api',retrievalId:'fixture-event',sha256:'af'.repeat(32),
 template:{id:'fixture-query',version:7},apiNames:[],fetchedAt:'2091-04-06',locator:{block:0,row:3,column:'column-abc'}};
const cell:VendorCell={code:'SYNTH',metric:'revenue_cum',duration:'YTD',periodEnd:'2090-12-31',unit:'cny_10k',status:'ok',valueText:'73510',missingReason:null,source,derived:null};
const stored=vendorCellPayload('Synthetic',cell,header);
describe('vendor drawer',()=>{
 it('locates a stored observation, preserves the full hash for copying, and labels missing vendor metadata',()=>{
  expect(stored.kind).toBe('vendor_observation');
  const view=adaptVendorDrawer(stored,'en',t);
  expect(view.sections.map(s=>s.id)).toEqual(['identity','source','times','transform','licence','links']);
  expect(view.sha).toBe(source.sha256);
  const body=JSON.stringify(view.sections);
  for(const text of ['fixture-query/7','column-abc','synthetic-parser','synthetic-mapping','synthetic-build','2091-04-07','vendor-reported/1','cnDrawer.noUrl','cnDrawer.notRecorded','cnDrawer.notPublished'])expect(body).toContain(text);
  expect(body).not.toContain(source.sha256);
  expect(new URL(vendorReplayUrl(cell),'https://fixture.invalid').searchParams.get('period_end')).toBe(cell.periodEnd);
 });
 it('rejects replay from another generation even when the active row matched its archive',()=>{
  const result={run:{run_id:'fixture-b'},replayed_text:'73510',match:true};
  expect(readReplayResult(result,header.runId)).toBeNull();
  expect(readReplayResult({...result,run:{run_id:header.runId}},header.runId)).toEqual({match:true,text:'73510'});
 });
 it('describes a computed value and keeps each observation for drill-down',()=>{
  const previous={...cell,periodEnd:'2089-12-31'};
  const p=vendorCellPayload('Synthetic',{...cell,metric:'revenue_yoy',unit:'pct',source:null,derived:{formula:'yoy/1',inputs:[cell,previous],memberCounts:{previous:"14",current:"19"},memberSetChanged:true}},header);
  expect(p.kind).toBe('vendor_derived');
  const view=adaptVendorDrawer(p,'en',t);
  expect(view.sections.map(s=>s.id)).toEqual(['identity','transform','inputs']);
  expect(view.sections[0].rows.some(r=>r.value.includes(previous.periodEnd)&&r.value.includes(cell.periodEnd))).toBe(true);
  expect(JSON.stringify(view.sections[1])).toContain('(V_t ÷ V_t−1y − 1) × 100');
 });
 it('identifies the security by the supplied code and states availability of dating',()=>{
  const p=vendorMembershipPayload('Synthetic',{securityName:'Imaginary Co',securityCode:'001987',source},header);
  expect(p.kind).toBe('vendor_membership');
  const view=adaptVendorDrawer(p,'zh',t);
  expect(view.title).toBe('Imaginary Co · 001987 ∈ Synthetic');
  expect(view.sections.map(s=>s.id)).toEqual(['source','times']);
  expect(JSON.stringify(view.sections)).toContain(source.fetchedAt);
  expect(JSON.stringify(view.sections)).toContain('cnDrawer.memberSince');
 });
});

it.each([['zh',zh,zhResearch],['en',en,enResearch]] as const)('renders the observation drawer with copy and replay actions in %s',(locale,industries,research)=>{
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{industries,research},
  children:createElement(VendorDrawer,{payload:stored,onOpen:()=>{},onClose:()=>{}})}));
 expect(html).toContain('data-drawer-kind="vendor_observation"');
 for(const text of [industries.cnDrawer.gildata,industries.cnDrawer.replay,industries.cnDrawer.thisRun,research.drawer.copy])expect(html).toContain(text);
 expect(html).toContain('href="#vendor-run"');
 expect(html).not.toContain(source.sha256);
});
