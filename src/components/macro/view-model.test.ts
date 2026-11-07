// Overview/series/versions JSON → view models (spec §3.2, §3.5): missing stays missing, counts not percentages,
// drawer keeps field names with 缺失 values, glance never invents rows.
import {describe,expect,it} from 'vitest';
import type {MacroT} from './use-macro-t';
import {MISSING} from './macro-format';
import {COMPACT_KEYS} from '@/lib/macro/views';
import {GLANCE_IDS,changeCounts,changeLines,collectionOf,coverageOf,glanceRows,proofRows,revisionRows,selectVersion,sourceLabels,sourceOf,sourceRows,statusKey,toIndicatorView,type IndicatorRowJson,type OverviewEnvelopeJson,type VersionJson} from './view-model';
const t:MacroT=(k,v)=>v?`${k}${JSON.stringify(v)}`:k;
const src={publisher:{zh:'美国劳工统计局',en:'BLS'},via:{zh:'FRED（圣路易斯联储）',en:'FRED'},fetch_host:'fred.stlouisfed.org',adapter:'fred_csv' as const,rights:'public_domain' as const,attribution:{zh:'来源：BLS via FRED',en:'Source: BLS via FRED'}};
// Rows in Task 13's IndicatorRow shape (views.ts): flat value fields, status letter, precomputed exact change.
const row=(o:Partial<IndicatorRowJson>):IndicatorRowJson=>({observation_id:'o-row',series_id:'US_UNRATE',name:{zh:'失业率',en:'Unemployment rate'},value_text:'4.2',unit:'pct',change:{kind:'pp',value_text:'-0.1'},
 period_end:'2026-09-30',available_at:'2026-10-15T12:30:00Z',timeliness:'current',status:'A',retrieval_id:'r1',sparkline:['4.3','4.2'],...o});
const env=(o:Partial<OverviewEnvelopeJson>={}):OverviewEnvelopeJson=>({snapshotId:'s1',asOf:'2026-11-03',catalogVersion:'macro-catalog/x',methodologyVersion:'v1.0',
 collection:[{dataset:'macro.fred',status:'fresh',lastOkAt:'2026-11-03T05:31:00Z'}],indicators:[row({})],changes:{counts:{new_release:0,revised:0,late:0,missing:0},items:[]},catalogCounts:{verified:6,missing:1,restricted:1},...o});
describe('toIndicatorView',()=>{
 it('active row: formatted value, formatted change, period from the catalog, available, catalog source',()=>{
  const v=toIndicatorView(row({}),'zh');
  expect(v).toMatchObject({seriesId:'US_UNRATE',name:'失业率',value:'4.2',unit:'%',change:{text:'−0.1 pp',arrow:'↓'},period:'2026-09',available:'2026-10-15 12:30 UTC',muted:false,hasEvidence:true,spark:['4.3','4.2']});
  expect(v.source).toEqual(sourceOf('US_UNRATE'));
  expect(v.source?.fetch_host).toBe('fred.stlouisfed.org');
  expect(toIndicatorView(row({series_id:'CN_GDP_YOY',period_end:'2026-09-30'}),'zh').period).toBe('2026-Q3');
 });
 it('missing / restricted rows are muted with reason and no numbers',()=>{
  const v=toIndicatorView(row({series_id:'US_ISM_PMI',status:'M',reason:{zh:'无可采的原始来源',en:'No source'},value_text:null,change:null,period_end:null,available_at:null,retrieval_id:null,sparkline:[],timeliness:'missing'}),'zh');
  expect(v).toMatchObject({muted:true,value:MISSING,change:null,period:MISSING,available:MISSING,reason:'无可采的原始来源',hasEvidence:false,source:null});
  expect(statusKey(v)).toBe('status.missing');
 });
 it('status key falls back to timeliness, n/a → na',()=>{
  expect(statusKey({status:'active',timeliness:'late'})).toBe('timeliness.late');
  expect(statusKey({status:'active',timeliness:'n/a'})).toBe('timeliness.na');
 });
});
describe('overview pieces',()=>{
 it('coverage is counts, with reasons for not-verified items; before any snapshot it counts the rows',()=>{
  const e=env({indicators:[row({}),row({series_id:'US_VIX',name:{zh:'VIX',en:'VIX'},status:'R',reason:{zh:'第三方版权',en:'Third-party'},value_text:null,change:null,period_end:null})]});
  expect(coverageOf(e,'zh')).toEqual({verified:6,total:8,notVerified:[{seriesId:'US_VIX',name:'VIX',status:'restricted',reason:'第三方版权'}]});
  expect(coverageOf({...e,catalogCounts:null},'zh')).toMatchObject({verified:1,total:2});
 });
 it('change counts come from the envelope; lines show the current published value of the changed row',()=>{
  const e=env({changes:{counts:{new_release:1,revised:1,late:0,missing:1},items:[{series_id:'US_UNRATE',kind:'revised',period_end:'2026-09-30'},{series_id:'US_CPI_YOY',kind:'new_release',period_end:'2026-10-31'},{series_id:'US_ISM_PMI',kind:'missing',period_end:null}]},
   indicators:[row({}),row({series_id:'US_CPI_YOY',name:{zh:'美国 CPI 同比',en:'US CPI YoY'},value_text:'3',period_end:'2026-10-31'})]});
  expect(changeCounts(e)).toEqual({new_release:1,revised:1,late:0,missing:1});
  const lines=changeLines(e,'zh');
  expect(lines[0]).toEqual({kind:'revised',seriesId:'US_UNRATE',name:'失业率',value:'4.2%',previous:null,period:'2026-09'});
  expect(lines[1]).toMatchObject({kind:'new_release',name:'美国 CPI 同比',value:'3%',period:'2026-10'});
  expect(lines[2]).toMatchObject({kind:'missing',name:'US_ISM_PMI',value:MISSING,period:MISSING});
 });
 it('collection: worst status wins, missing lastOk shows —',()=>{
  const c=collectionOf(env({collection:[{dataset:'macro.fred',status:'fresh',lastOkAt:'2026-11-03T05:31:00Z'},{dataset:'macro.akshare',status:'error',lastOkAt:null}]}));
  expect(c.overall).toBe('error');expect(c.items[1]).toEqual({dataset:'macro.akshare',status:'error',lastOk:MISSING});
 });
 it('source labels: publisher via forwarder from the catalog, active rows only, unique',()=>{
  expect(sourceLabels([row({}),row({series_id:'US_CPI_YOY'}),row({series_id:'US_ISM_PMI',status:'M'})],'en')).toEqual(['U.S. Bureau of Labor Statistics via FRED (Federal Reserve Bank of St. Louis)']);
 });
 it('glance ids equal the overview compact keys; glance takes only the key ids present, never placeholders',()=>{
  expect(GLANCE_IDS).toEqual(COMPACT_KEYS);
  const g=glanceRows({regions:{US:env({indicators:[row({series_id:'US_DFF'}),row({series_id:'US_DGS10',name:{zh:'10 年美债',en:'UST 10Y'},change:{kind:'bp',value_text:'10'}})]})}},'zh');
  expect(g).toHaveLength(1);expect(g[0].region).toBe('US');expect(g[0].rows.map(r=>r.seriesId)).toEqual(['US_DFF','US_DGS10']);
  expect(g[0].rows[1].change?.text).toBe('+10 bp');
  expect(glanceRows({regions:{}},'zh')).toEqual([]);
 });
});
describe('drawer rows',()=>{
 const v=(o:Partial<VersionJson>={}):VersionJson=>({observation_id:'o2',series_id:'US_UNRATE',version:2,value_text:'4.2',available_at:'2026-10-03T12:30:00Z',availability_basis:'first_seen',
  retrieval:{retrieval_id:'r1',fetch_url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE&cosd=2000-01-01',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-10-03T12:30:00Z',tool_versions:{parser:'fred-csv@1',code:'abc'}},
  evidence:{sha256:'b'.repeat(64),adapter:'fred_csv',content_type:'text/csv',byte_length:12345},locator:{kind:'csv_row',line:933,column:1},transform:null,derived_from:null,inputs:[],...o});
 it('source rows: publisher, via, rights, attribution',()=>{
  expect(sourceRows(src,t,'en').map(r=>[r.key,r.value])).toEqual([['publisher','BLS'],['via','FRED'],['rights','drawer.rightsValues.public_domain'],['attribution','Source: BLS via FRED']]);
  expect(sourceRows(null,t,'en').every(r=>r.missing&&r.value==='drawer.missing')).toBe(true);
 });
 it('proof rows for a native observation',()=>{
  const r=Object.fromEntries(proofRows(v(),t).map(x=>[x.key,x.value]));
  expect(r).toMatchObject({fetchUrl:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE&cosd=2000-01-01',host:'fred.stlouisfed.org',fetchedAt:'2026-10-03 12:30 UTC',sha256:'b'.repeat(64),
   locator:'drawer.csvRow{"line":933,"column":1}',transform:'drawer.none',adapter:'drawer.adapters.fred_csv',toolVersions:'code=abc · parser=fred-csv@1'});
 });
 it('missing evidence keeps every field name with the value 缺失',()=>{
  const rows=proofRows(v({retrieval:null,evidence:null,locator:null}),t);
  for(const k of ['fetchUrl','host','fetchedAt','sha256','locator','adapter','toolVersions'])expect(rows.find(r=>r.key===k)).toMatchObject({value:'drawer.missing',missing:true});
 });
 it('revision rows: newest first; older versions marked superseded',()=>{
  expect(revisionRows([v({version:1,observation_id:'o1',value_text:'4.3'}),v()],t).map(r=>[r.version,r.value,r.note])).toEqual([['v2','4.2','drawer.current'],['v1','4.3','drawer.superseded{"version":2}']]);
 });
 it('the drawer proves the exact version shown: an old snapshot after a new revision selects v1, not the newest (第 4 稿 P1-9)',()=>{
  const versions=[v(),v({version:1,observation_id:'o1',value_text:'4.3'})];   // route order: newest first
  expect(selectVersion(versions,'o1')).toMatchObject({observation_id:'o1',version:1,value_text:'4.3'});
  expect(selectVersion(versions,'o2')).toMatchObject({observation_id:'o2',version:2});
  expect(selectVersion(versions,'gone')).toBeNull();                                               // never relabels another version's proof
  expect(selectVersion(versions,null)).toMatchObject({version:2});                                 // no id (legacy caller) → newest
  expect(toIndicatorView(row({observation_id:'o1'}),'zh').observationId).toBe('o1');
 });
});
