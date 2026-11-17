import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:()=>({cells:[]})}));
import {cellRow,runRow} from '@/lib/industry/fixture-rows';
import {publicCell,runHeader} from '@/lib/industry/read';
import {cellPresentation} from './cell-text';
import {adaptSourceDrawer} from './source-drawer-adapter';
import {heatmapModel} from './heatmap-model';
import {stockPath} from './hrefs';
const t=(key:string,v?:Record<string,string|number>)=>key==='coverage.tooFewMembers'?`too few members ${v?.n}<${v?.min}`:key;
const cell=publicCell(cellRow({value:'123456789',n_members:61,n_with_data:31,n_unresolved:2}));
const p={kind:'aggregate' as const,scheme:'sic' as const,code:'7372',nodeName:'Software',cell:{...cell,display:'value' as const},header:runHeader(runRow()),preview:false};
const source=(f:string)=>readFileSync(`src/components/industries/${f}`,'utf8');
describe('unified cell presentation',()=>{
 it.each(['coverageSic','insufficient','members','missing','unresolved','unlicensed'] as const)('suppresses %s values',display=>{
  const result=cellPresentation({...cell,display},'revenue_sum','en',t);
  expect(result.value).toBeUndefined();
  expect(result.state).toBe(display==='unlicensed'?'withheld':display==='missing'?'missing':'lowCoverage');
 });
 it('preserves scheme coverage denominators and member minimum',()=>{
  expect(cellPresentation({...cell,display:'coverageSic'},'revenue_sum','en',t).detail).toBe('31/61');
  expect(cellPresentation({...cell,display:'insufficient'},'revenue_sum','en',t).detail).toBe('31/63');
  expect(cellPresentation({...cell,display:'members',nMembers:3},'revenue_sum','en',t).detail).toBe('too few members 3<5');
 });
});
describe('source adapter',()=>{
 it('maps aggregate identity, versions, coverage and reconstruction',()=>{
  const a=adaptSourceDrawer(p,'en',t);
  expect(a?.variant).toBe('ok');
  if(a?.variant!=='ok')throw Error('expected ok');
  expect(a.payload.kind).toBe('industry_metric');
  expect(a.payload.transform.method_version).toBe(p.header.methodVersion);
  expect(a.extras?.states).toContain('reconstructed');
  expect(a.extras?.rows?.source?.find(r=>r.key==='coverage')?.value).toBe('31/63');
  expect(a.extras?.rows?.source?.find(r=>r.key==='run')?.value).toBe(p.header.runId);
 });
 it('never exposes a suppressed value in extras',()=>{
  const a=adaptSourceDrawer({...p,cell:{...p.cell,display:'members'}},'en',t);
  expect(a?.variant==='ok'&&a.extras?.value).toBeUndefined();
 });
 it('withheld carries identity and reason only',()=>{
  const a=adaptSourceDrawer(p,'en',t,{unlicensed:true});
  expect(a).toMatchObject({variant:'withheld',kind:'industry_metric'});
  expect(a).not.toHaveProperty('payload');expect(a).not.toHaveProperty('extras');
  expect(adaptSourceDrawer({...p,cell:{...p.cell,display:'unlicensed'}} as unknown as typeof p,'en',t)?.variant).toBe('withheld');
 });
 it('membership has no evidence kind',()=>{
  expect(adaptSourceDrawer({kind:'membership'} as never,'en',t)).toBeNull();
 });
 it('maps facts and valuations',()=>{
  const f=adaptSourceDrawer({kind:'fact',issuerName:'Issuer',ticker:'AAPL',fact:{factId:'f',concept:'revenue',value:'42',unit:'USD',periodStart:null,periodEnd:'2025-12-31',duration:'12M',availableDate:'2026-01-01',filingId:'filing',rawHash:'hash'}},'en',t);
  expect(f?.variant==='ok'&&f.payload.kind).toBe('financial_fact');
  const v=adaptSourceDrawer({kind:'valuation',scheme:'sw2021',code:'a',nodeName:'A',runId:'run',preview:false,cell:{code:'a',tradeDate:'2026-01-01',metric:'pb',value:'1.2',factsAsOf:'2026-01-01',nMembers:10,nWithData:8,nUnresolved:0,mcapCoverage:'0.8',manifestHash:'hash',updatedAt:null}},'en',t);
  expect(v?.variant==='ok'&&v.payload.kind).toBe('industry_metric');
 });
});
describe('responsive foundation integration',()=>{
 it('uses shared series switch and gaps with basis and availability columns',()=>{
  expect(source('SeriesChart.tsx')).toContain('ChartTableSwitch');
  expect(source('SeriesChart.tsx')).toContain('lg:grid-cols-2');
  expect(source('SeriesChart.tsx')).toContain("t('drawer.availableAt')");
  expect(source('series-model.ts')).toContain('lineSegments(');
 });
 it('keeps latest three mobile periods and 44px targets',()=>{
  const rows=heatmapModel([{code:'a',level:1,nameZh:null,nameEn:null,parentCode:null}],['1','2','3','4'],[],'revenue_sum','en');
  expect(rows[0].cells.map(c=>c.mobileHidden)).toEqual([true,false,false,false]);
  expect(source('Heatmap.tsx')).toContain('min-h-[44px]');
 });
 it('uses shared drawer with transform pending/failure and keeps membership dialog',()=>{
  expect(source('SourceDrawer.tsx')).toContain('<SharedSourceDrawer');
  expect(source('SourceDrawer.tsx')).toContain('pending=');
  expect(source('SourceDrawer.tsx')).toContain('failed=');
  expect(source('SourceDrawer.tsx')).toContain('<MembershipBody');
 });
 it('keeps company href and exposes the conditional link on phones',()=>{
  expect(stockPath('BRK.B')).toBe('/stock/BRK.B');
  const page=readFileSync('src/app/(app)/intel/industries/[scheme]/[code]/constituents/page.tsx','utf8');
  expect(page).toContain('r.ticker&&<Link href={stockPath(r.ticker)}');
  expect(page).not.toContain('hidden py-1.5 pr-4 sm:table-cell');
 });
 it('offers a published valuation or the not-published notice',()=>{
  const page=readFileSync('src/app/(app)/intel/industries/[scheme]/[code]/page.tsx','utf8');
  expect(page).toContain("v.valuation.state==='published'");
  expect(page).toContain('kind="notPublished"');
 });
});
