// src/components/industries/industries-models.test.ts
// Component logic of the industry pages (repo convention: tests import .ts models, never .tsx).
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));
import {ISSUER_A,RUN_ID,cellRow,manifestOf,missingCell,runRow} from '@/lib/industry/fixture-rows';
import {publicCell,runHeader} from '@/lib/industry/read';
import {ALPHA_MAX,ALPHA_MIN,alphaFor,brassBackground,heatmapModel} from './heatmap-model';
import {seriesGeometry} from './series-model';
import {diffCounts,errorCodeOf,factEvidenceUrl,inputRows,normalizeRecompute,normalizeReplay,replayUrl,roleSummary,short} from './drawer-model';
import {constituentsPath,flatSearch,hrefWith,industryPath,nodeName} from './hrefs';

const node=(code:string,nameZh:string)=>({code,level:1,nameZh,nameEn:null,parentCode:null});

describe('heatmap model',()=>{
 const ends=['2021-12-31','2022-12-31','2023-12-31','2024-12-31','2025-12-31','2026-12-31'];
 const cells=[
  publicCell(cellRow({period_end:'2025-12-31',value:'0.5'})),publicCell(cellRow({period_end:'2024-12-31',value:'0.1'})),publicCell(cellRow({period_end:'2023-12-31',value:'0.3'})),
  publicCell(cellRow({period_end:'2022-12-31',value:'0.9',n_with_data:2})),publicCell(missingCell({code:'801780.SI',period_end:'2025-12-31'})),
 ];
 it('single brass hue: alpha 0.12–0.6 over the value range of value-displayed cells only',()=>{
  const rows=heatmapModel([node('801120.SI','食品饮料'),node('801780.SI','银行')],ends,cells,'gross_margin','zh');
  const r=rows[0].cells;
  expect(r.find(c=>c.periodEnd==='2024-12-31')?.alpha).toBe(ALPHA_MIN);
  expect(r.find(c=>c.periodEnd==='2025-12-31')?.alpha).toBe(ALPHA_MAX);
  expect(r.find(c=>c.periodEnd==='2023-12-31')?.alpha).toBe(0.36);
  expect(r.find(c=>c.periodEnd==='2022-12-31')).toMatchObject({alpha:null,text:{kind:'insufficient',n:2,d:10}});   // 0.9 does not stretch the scale
  expect(r.find(c=>c.periodEnd==='2025-12-31')?.text).toEqual({kind:'value',text:'50.0%'});
  expect(rows[1].cells.find(c=>c.periodEnd==='2025-12-31')?.text).toEqual({kind:'missing',reason:'financial_excluded'});
  expect(rows[1].cells.find(c=>c.periodEnd==='2024-12-31')?.text).toEqual({kind:'missing',reason:'absent'});
 });
 it('only the last 5 columns survive on mobile',()=>{
  const rows=heatmapModel([node('801120.SI','食品饮料')],ends,cells,'gross_margin','zh');
  expect(rows[0].cells.map(c=>c.mobileHidden)).toEqual([true,false,false,false,false,false]);
 });
 it('alpha helpers use the brass token, never a hard-coded colour',()=>{
  expect(alphaFor(5,5,5)).toBe(0.36);
  expect(brassBackground(0.6)).toBe('color-mix(in srgb, var(--accent) 60%, transparent)');
 });
});

describe('series geometry',()=>{
 const pts=['2021-12-31','2022-12-31','2023-12-31','2024-12-31'].map((pe,i)=>({periodEnd:pe,cell:i===2?publicCell(missingCell({period_end:pe})):publicCell(cellRow({period_end:pe,value:String(0.4+i/100)}))}));
 it('breaks the line at missing cells; a dot per ok cell; year labels; formatted ticks',()=>{
  const g=seriesGeometry(pts,'gross_margin','zh');
  expect(g.segments).toHaveLength(2);
  expect(g.segments[0].startsWith('M')).toBe(true);
  expect(g.segments[0]).toContain(' L');
  expect(g.dots.map(d=>d.periodEnd)).toEqual(['2021-12-31','2022-12-31','2024-12-31']);
  expect(g.xLabels.map(l=>l.label)).toEqual(['2021','2022','2023','2024']);
  expect(g.yTicks).toHaveLength(4);
  for(const tk of g.yTicks)expect(tk.label).toMatch(/^\d+\.\d%$/);
  expect(g.dots[0].y).toBeGreaterThan(g.dots[2].y);   // larger value is higher on screen
 });
 it('no ok cells: no segments, no dots',()=>{
  const g=seriesGeometry([{periodEnd:'2025-12-31',cell:null}],'roe','en');
  expect(g.segments).toEqual([]);expect(g.dots).toEqual([]);
 });
});

describe('drawer model',()=>{
 const header=runHeader(runRow());
 const p={kind:'aggregate' as const,scheme:'sw2021' as const,code:'801120.SI',nodeName:'食品饮料',cell:publicCell(cellRow()),header,preview:false};
 it('public replay URLs carry runId/metric/duration/periodEnd/mode; the admin preview uses the admin route and has no recompute',()=>{
  expect(replayUrl(p,'original')).toBe(`/api/industries/sw2021/801120.SI/replay?runId=${RUN_ID}&metric=gross_margin&duration=12M&periodEnd=2025-12-31&mode=original`);
  expect(replayUrl(p,'recompute')).toContain('mode=recompute');
  expect(replayUrl({...p,preview:true},'original')).toBe(`/api/admin/industries/replay?runId=${RUN_ID}&code=801120.SI&periodEnd=2025-12-31&metric=gross_margin&duration=12M`);
  expect(replayUrl({...p,preview:true},'recompute')).toBeNull();
 });
 it('normalises the public body and the admin focus; rejects anything else',()=>{
  const body={cell:p.cell,manifestHash:'h',manifest:manifestOf(),replay:[],reproduced:true};
  expect(normalizeReplay(body)?.reproduced).toBe(true);
  expect(normalizeReplay({run:{},focus:body})?.manifestHash).toBe('h');
  expect(normalizeReplay({error:{code:'unknown_cell'}})).toBeNull();
  expect(normalizeRecompute({result:'changed',diff:{}})?.result).toBe('changed');
  expect(normalizeRecompute({result:'maybe',diff:{}})).toBeNull();
  expect(errorCodeOf(429,{error:{code:'rate_limited'}})).toBe('rate_limited');
  expect(errorCodeOf(404,{error:'unknown_cell'})).toBe('unknown_cell');
  expect(errorCodeOf(502,null)).toBe('http_502');
 });
 it('role, input and diff summaries',()=>{
  const m=manifestOf({roles:[{issuer_id:ISSUER_A,metric:'gross_margin',duration:'12M',role:'included'},{issuer_id:'b',metric:'gross_margin',duration:'12M',role:'excluded',reason:'missing_concept'},{issuer_id:'c',metric:'gross_margin',duration:'12M',role:'excluded',reason:'missing_concept'},{issuer_id:'d',metric:'gross_margin',duration:'12M',role:'excluded',reason:'unit_excluded'}]});
  expect(roleSummary(m)).toEqual({included:1,excluded:[{reason:'missing_concept',n:2},{reason:'unit_excluded',n:1}]});
  const inputs=inputRows(m,2);
  expect(inputs.total).toBe(3);
  expect(inputs.rows.map(r=>[r.ticker,r.concept])).toEqual([['600519.SH','cost_of_revenue'],['600519.SH','revenue']]);
  expect(diffCounts({members:{added:['x'],removed:[],modified:['z']},unresolved:{added:[],removed:['y']},facts:{added:['f1','f2'],removed:[]},stateRevs:[{issuerId:'i',from:1,to:2}],cells:[]})).toEqual({ma:1,mr:0,mm:1,ua:0,ur:1,fa:2,fr:0,revs:1});
  expect(factEvidenceUrl('600519.SH','f')).toBe('/api/facts/600519.SH?factIds=f');
  expect(factEvidenceUrl(null,'f')).toBeNull();
  expect(short('e'.repeat(64))).toBe('eeee…eeee');
 });
});

describe('hrefs',()=>{
 it('search-param links are stable and drop empty keys',()=>{
  expect(hrefWith('/intel/industries',{scheme:'sw2021',metric:'roe'},{view:'table',metric:undefined})).toBe('/intel/industries?scheme=sw2021&view=table');
  expect(hrefWith('/x',{},{})).toBe('/x');
  expect(industryPath('sw2021','801120.SI')).toBe('/intel/industries/sw2021/801120.SI');
  expect(constituentsPath('sic','3674')).toBe('/intel/industries/sic/3674/constituents');
  expect(flatSearch({a:['1','2'],b:'x',c:undefined})).toEqual({a:'1',b:'x',c:undefined});
 });
 it('SW has no English names: the English UI shows the Chinese name',()=>{
  expect(nodeName(node('801120.SI','食品饮料'),'en')).toBe('食品饮料');
  expect(nodeName({code:'3674',nameZh:null,nameEn:'Semiconductors'},'zh')).toBe('Semiconductors');
 });
});
