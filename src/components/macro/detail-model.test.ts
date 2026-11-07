// Indicator detail helpers (spec §3.3): windows, exact period changes, chart points, markers, asset tones.
import {describe,expect,it} from 'vitest';
import {ALL_START,assetChangeView,chartPoints,cycleKey,dateChunks,defaultWindow,diffByPeriod,fetchSeriesWindow,markersOf,sourceJsonOf,transformLabel,windowFrom,windowsFor,yoyOf} from './detail-model';
import type {SeriesObsJson} from './view-model';
const o=(pe:string,v:string,extra:Partial<SeriesObsJson>={}):SeriesObsJson=>({observation_id:pe,period_end:pe,value_text:v,version:1,available_at:'2026-01-01T00:00:00Z',availability_basis:'first_seen',retrieval_id:null,evidence_sha256:null,locator:null,transform:null,code_version:'c',...extra});
const diff=(pe:string,v:string,prev:string):SeriesObsJson=>o(pe,v,{observation_id:null,version:null,computed:{kind:'diff',version:'macro-diff/1',inputs:[prev,pe]}});
describe('detail model',()=>{
 it('window start dates (leap day clamps); all starts at a fixed early date; daily series default to 1Y',()=>{
  expect(windowFrom('y3','2026-11-06')).toBe('2023-11-06');expect(windowFrom('y5','2024-02-29')).toBe('2019-02-28');expect(windowFrom('all','2026-11-06')).toBe(ALL_START);expect(windowFrom('y1','2026-11-06')).toBe('2025-11-06');
  expect(defaultWindow('day')).toBe('y1');expect(defaultWindow('month')).toBe('y5');expect(windowsFor('day')).toEqual(['y1','y3','y5']);expect(windowsFor('month')).toContain('all');
 });
 it('date chunks stay under 600 points for every period kind and tile the range without gaps',()=>{
  const days=(a:string,b:string)=>(Date.parse(b)-Date.parse(a))/86_400_000+1;
  const d=dateChunks('2021-11-06','2026-11-06','day');
  expect(d.length).toBeGreaterThan(1);for(const c of d)expect(days(c.from,c.to)).toBeLessThanOrEqual(500);
  expect(d[0].from).toBe('2021-11-06');expect(d.at(-1)?.to).toBe('2026-11-06');
  d.slice(1).forEach((c,i)=>expect(Date.parse(c.from)-Date.parse(d[i].to)).toBe(86_400_000));
  const m=dateChunks(ALL_START,'2026-11-06','month');
  for(const c of m)expect((Number(c.to.slice(0,4))-Number(c.from.slice(0,4))+1)*12).toBeLessThanOrEqual(600);
  expect(m.length).toBe(3);expect(dateChunks('2025-01-01','2026-11-06','month')).toEqual([{from:'2025-01-01',to:'2026-11-06'}]);
  expect(dateChunks('2026-11-06','2026-11-06','day')).toEqual([{from:'2026-11-06',to:'2026-11-06'}]);
 });
 it('chunked fetch merges ascending, drops duplicates and keeps extras from the last chunk; a failing chunk throws its code',async()=>{
  const calls:string[]=[];
  const fake=(async(url:string)=>{calls.push(url);const from=new URL(url,'https://x').searchParams.get('from')!;
   return {ok:true,json:async()=>({observations:from<'2000'?[o('1999-12-31','1')]:[o('2001-01-31','2'),o('1999-12-31','1')],marker:from})};}) as unknown as typeof fetch;
  const r=await fetchSeriesWindow('US_UNRATE','1990-01-01','2030-12-31','month','raw',fake);
  expect(calls).toHaveLength(2);expect(r.observations.map(x=>x.period_end)).toEqual(['1999-12-31','2001-01-31']);expect((r as unknown as {marker:string}).marker).toBe('2030-01-01');
  const bad=(async()=>({ok:false,status:400,json:async()=>({error:{code:'too_many_points'}})})) as unknown as typeof fetch;
  await expect(fetchSeriesWindow('US_UNRATE','2020-01-01','2021-01-01','month','diff',bad)).rejects.toThrow('too_many_points');
  expect(calls.every(u=>!u.includes('transform='))).toBe(true);
 });
 it('yoy offered only for a declared derivation; a yoy series is its own',()=>{
  const cat=[{id:'IDX',derive:undefined},{id:'YOY',derive:{kind:'yoy_from_index' as const,from:'IDX'}},{id:'CNYOY',derive:{kind:'index_minus_100' as const,from:'CNIDX'}},{id:'CNIDX',derive:undefined},{id:'ME',derive:{kind:'month_end' as const,from:'D'}}];
  expect(yoyOf(cat[0],cat)).toEqual({self:false,id:'YOY'});expect(yoyOf(cat[1],cat)).toEqual({self:true,id:'YOY'});expect(yoyOf(cat[3],cat)).toEqual({self:false,id:'CNYOY'});
  expect(yoyOf(cat[4],cat)).toBeNull();expect(yoyOf({id:'D',derive:undefined},cat)).toBeNull();
 });
 it('chart points come from rows as given (levels, or the server diff rows); diff lookups and the header transform label',()=>{
  const lv=[o('2026-08-31','4.78'),o('2026-09-30','4.80')];
  expect(chartPoints(lv)).toEqual([{time:'2026-08-31',value:4.78},{time:'2026-09-30',value:4.8}]);
  const df=[diff('2026-09-30','0.02','2026-08-31')];
  expect(chartPoints(df)).toEqual([{time:'2026-09-30',value:0.02}]);
  expect(diffByPeriod([...lv,...df]).get('2026-09-30')).toBe('0.02');expect(diffByPeriod(lv).size).toBe(0);
  expect(transformLabel(df,true)).toBe('macro-diff/1');expect(transformLabel([o('2026-09-30','1',{transform:'yoy_from_index@1'})],false)).toBe('yoy_from_index@1');expect(transformLabel([],false)).toBeNull();
 });
 it('markers: derived events and FOMC meetings from the first plotted month, sorted',()=>{
  const ev=[{effective_date:'2024-09-18',change_bp:'-50'},{effective_date:'2019-08-01',change_bp:'-25'}] as Parameters<typeof markersOf>[0];
  const cal=[{start:'2024-09-17',end:'2024-09-18'}] as Parameters<typeof markersOf>[1];
  expect(markersOf(ev,cal,'2024-09-30')).toEqual([{time:'2024-09-18',kind:'calendar',text:'FOMC'},{time:'2024-09-18',kind:'derived',text:'-50 bp'}]);
 });
 it('cycle label keys distinguish policy cycles',()=>{
  expect(cycleKey({basis:'policy_events',direction:'up'})).toBe('detail.policyDirection.up');
  expect(cycleKey({basis:'trailing_median',direction:'down'})).toBe('detail.direction.down');
 });
 it('asset moves: signed, unit-suffixed, toned; missing stays missing',()=>{
  expect(assetChangeView({change_text:'2.6845',change_kind:'pct'})).toEqual({text:'+2.68%',tone:'up'});
  expect(assetChangeView({change_text:'-75',change_kind:'bp'})).toEqual({text:'−75 bp',tone:'down'});
  expect(assetChangeView({change_text:'0',change_kind:'pct'})).toEqual({text:'0.00%',tone:'flat'});
  expect(assetChangeView({change_text:null,change_kind:'bp'})).toEqual({text:'—',tone:'missing'});
 });
 it('source json from a catalog def',()=>{
  expect(sourceJsonOf({source:null})).toBeNull();
  expect(sourceJsonOf({source:{adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher:{zh:'a',en:'A'},seriesKey:'UNRATE',rights:'public_domain',attribution:{zh:'b',en:'B'}}}))
   .toEqual({publisher:{zh:'a',en:'A'},via:null,fetch_host:'fred.stlouisfed.org',adapter:'fred_csv',rights:'public_domain',attribution:{zh:'b',en:'B'}});
 });
});
