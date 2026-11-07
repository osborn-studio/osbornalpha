// src/lib/macro/catalog.test.ts
// Catalog invariants (spec §4.2, §0.2 M1–M5, M14, M15) and the content-derived CATALOG_VERSION.
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {CATALOG_VERSION,MACRO_CATALOG,canonicalJson,catalogById,collectableOf,indicatorsOf,regimeInputsOf,sha256HexSync} from './catalog';
import {REGIMES} from './judgment-contract';

const BANNED=/yfinance|yahoo|eastmoney|jin10|sina|10jqka|xueqiu/i;
const AKSHARE_HOSTS=new Set(['data.stats.gov.cn','yield.chinabond.com.cn','www.safe.gov.cn']);
const weightOf=(region:'US'|'CN')=>MACRO_CATALOG.filter(d=>d.region===region&&d.role==='indicator').reduce((s,d)=>s+d.weight,0);

describe('MACRO_CATALOG invariants',()=>{
 it('has unique ids of the stored form and bilingual names',()=>{
  const ids=MACRO_CATALOG.map(d=>d.id);
  expect(new Set(ids).size).toBe(ids.length);
  for(const d of MACRO_CATALOG){expect(d.id).toMatch(/^[A-Z][A-Z0-9_]{0,63}$/);expect(d.name.zh.length).toBeGreaterThan(0);expect(d.name.en.length).toBeGreaterThan(0);expect(d.definitionVersion).toBeGreaterThanOrEqual(1);}
 });
 it('never names a banned host or vendor anywhere',()=>{
  expect(JSON.stringify(MACRO_CATALOG)).not.toMatch(BANNED);
 });
 it('active akshare series fetch only from verified official hosts; FRED series from fred.stlouisfed.org',()=>{
  for(const d of MACRO_CATALOG){
   if(d.status!=='active'||!d.source)continue;
   if(d.source.adapter==='akshare')expect({id:d.id,host:d.source.fetchHost,ok:AKSHARE_HOSTS.has(d.source.fetchHost)}).toEqual({id:d.id,host:d.source.fetchHost,ok:true});
   else expect(d.source.fetchHost).toBe('fred.stlouisfed.org');
  }
 });
 it('missing ⇒ source null + reason; restricted ⇒ third_party rights + reason; active ⇒ source and no reason',()=>{
  for(const d of MACRO_CATALOG){
   if(d.status==='missing'){expect(d.source).toBeNull();expect(d.reason?.zh&&d.reason.en).toBeTruthy();}
   if(d.status==='restricted'){expect(d.source?.rights).toBe('third_party');expect(d.reason?.zh&&d.reason.en).toBeTruthy();}
   if(d.status==='active'){expect(d.source).not.toBeNull();expect(d.reason).toBeUndefined();expect(d.source!.rights).not.toBe('third_party');}
  }
 });
 it('FRED rows record the original publisher via FRED; NBS-relayed rows record the original agency via NBS',()=>{
  for(const d of MACRO_CATALOG){
   if(d.source?.adapter==='fred_csv'){expect(d.source.via?.en).toMatch(/FRED/);expect(d.source.publisher.en).not.toMatch(/FRED/);}
  }
  expect(catalogById('CN_M2_YOY')!.source).toMatchObject({publisher:{en:"People's Bank of China"},via:{en:'National Bureau of Statistics of China'}});
  expect(catalogById('CN_EXPORT_YOY')!.source).toMatchObject({publisher:{en:'General Administration of Customs of China'},via:{en:'National Bureau of Statistics of China'}});
 });
 it('derived and alias series point at an existing series of the same region; derived series carry their input source',()=>{
  for(const d of MACRO_CATALOG){
   if(d.derive){const from=catalogById(d.derive.from);expect({id:d.id,from:from?.id,region:from?.region}).toEqual({id:d.id,from:d.derive.from,region:d.region});expect(from!.derive).toBeUndefined();expect(d.source).toEqual(from!.source);expect(d.status).toBe(from!.status);}
   if(d.aliasOf){const to=catalogById(d.aliasOf);expect(to?.region).toBe(d.region);expect(d.source).toEqual(to!.source);expect(d.derive).toBeUndefined();expect(d.weight).toBe(0);}
  }
  expect(catalogById('US_CPI_YOY')!.derive).toEqual({kind:'yoy_from_index',from:'US_CPI_INDEX'});
  expect(catalogById('CN_CPI_YOY')!.derive).toEqual({kind:'index_minus_100',from:'CN_CPI_INDEX'});
  expect(catalogById('US_DGS10')!.derive).toEqual({kind:'month_end',from:'US_DGS10_D'});
  expect(catalogById('US_UST10Y')).toMatchObject({role:'asset',aliasOf:'US_DGS10',changeKind:'bp'});
  expect(catalogById('CN_CGB10Y')).toMatchObject({role:'asset',aliasOf:'CN_CGB_10Y',changeKind:'bp'});
 });
 it('daily and event native ids carry weight 0; assets carry weight 0',()=>{
  for(const d of MACRO_CATALOG){
   if(!d.derive&&(d.nativeFrequency==='daily'||d.nativeFrequency==='event')&&d.status==='active')expect({id:d.id,w:d.weight}).toEqual({id:d.id,w:0});
   if(!d.derive&&d.nativeFrequency==='daily')expect({id:d.id,w:d.weight}).toEqual({id:d.id,w:0});
   if(d.role!=='indicator')expect({id:d.id,w:d.weight}).toEqual({id:d.id,w:0});
  }
 });
 it('weights per spec §4.2 (US 100, CN 125 including missing/restricted rows)',()=>{
  const w=(id:string)=>catalogById(id)!.weight;
  expect([w('US_DFF'),w('US_DGS10'),w('US_DTWEXBGS'),w('US_CPI_YOY'),w('US_UNRATE'),w('US_PPI_FD_YOY'),w('US_ISM_PMI'),w('US_VIX')]).toEqual([25,15,10,15,10,5,15,5]);
  expect([w('CN_CPI_YOY'),w('CN_PPI_YOY'),w('CN_PMI_MFG'),w('CN_GDP_YOY'),w('CN_M2_YOY'),w('CN_EXPORT_YOY'),w('CN_CGB_10Y'),w('CN_USDCNY_CP'),w('CN_LPR_1Y'),w('CN_MLF_1Y'),w('CN_AFRE_STOCK_YOY')]).toEqual([10,15,15,5,10,10,15,5,10,10,20]);
  expect(weightOf('US')).toBe(100);expect(weightOf('CN')).toBe(125);
 });
 it('adjustment, release lags and statuses per spec §4.2 / §0.2 M15',()=>{
  for(const id of ['US_CPI_INDEX','US_CPI_YOY','US_UNRATE','US_PPI_FD_INDEX','US_PPI_FD_YOY'])expect(catalogById(id)!.adjustment).toBe('sa');
  for(const d of MACRO_CATALOG)if(d.nativeFrequency==='daily'||(d.derive?.kind==='month_end'))expect({id:d.id,a:d.adjustment}).toEqual({id:d.id,a:'na'});
  for(const id of ['CN_CPI_INDEX','CN_PPI_INDEX','CN_GDP_INDEX','CN_M2_YOY','CN_EXPORT_YOY'])expect(catalogById(id)!.adjustment).toBe('nsa');
  const lag=(id:string)=>catalogById(id)!.releaseLagDays;
  expect([lag('US_CPI_YOY'),lag('US_UNRATE'),lag('US_PPI_FD_YOY'),lag('CN_CPI_YOY'),lag('CN_PPI_YOY'),lag('CN_PMI_MFG'),lag('CN_GDP_YOY'),lag('CN_M2_YOY'),lag('CN_EXPORT_YOY')]).toEqual([15,7,15,12,12,1,20,15,10]);
  for(const d of MACRO_CATALOG)if(d.nativeFrequency==='daily'||d.nativeFrequency==='event'||d.derive?.kind==='month_end')expect({id:d.id,lag:d.releaseLagDays}).toEqual({id:d.id,lag:undefined});
  expect(MACRO_CATALOG.filter(d=>d.status==='missing').map(d=>d.id).sort()).toEqual(['CN_AFRE_STOCK_YOY','CN_LPR_1Y','CN_MLF_1Y','US_ISM_PMI']);
  expect(MACRO_CATALOG.filter(d=>d.status==='restricted').map(d=>d.id).sort()).toEqual(['CN_CSI300','US_DJIA','US_NASDAQCOM','US_SP500','US_VIX','US_VIX_D']);
  expect(catalogById('CN_USDCNY_CP_D')!.unit).toBe('cny_per_100usd');
 });
});

describe('MACRO-P3 catalog addition (WP-S6)',()=>{
 it('US_FED_TARGET_D: FRED DFEDTAR, event_source, immutable, weight 0, daily, never a regime input',()=>{
  expect(catalogById('US_FED_TARGET_D')).toMatchObject({region:'US',role:'event_source',type:'policy_rate',unit:'pct',nativeFrequency:'daily',period:'day',status:'active',revisionPolicy:'immutable',weight:0,changeKind:'bp',
   source:{adapter:'fred_csv',seriesKey:'DFEDTAR',fetchHost:'fred.stlouisfed.org',rights:'public_domain',publisher:{en:'Board of Governors of the Federal Reserve System'}}});
  expect(regimeInputsOf('US').map(d=>d.id)).not.toContain('US_FED_TARGET_D');
  expect(indicatorsOf('US').map(d=>d.id)).not.toContain('US_FED_TARGET_D');
 });
});

describe('catalog helpers',()=>{
 it('indicatorsOf lists display indicators (no derive inputs, no event sources); regimeInputsOf keeps active weighted monthly/quarterly ones',()=>{
  expect(indicatorsOf('US').map(d=>d.id)).toEqual(['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY','US_ISM_PMI','US_VIX']);
  expect(indicatorsOf('CN').map(d=>d.id)).toEqual(['CN_CPI_YOY','CN_PPI_YOY','CN_PMI_MFG','CN_GDP_YOY','CN_M2_YOY','CN_EXPORT_YOY','CN_CGB_10Y','CN_USDCNY_CP','CN_LPR_1Y','CN_MLF_1Y','CN_AFRE_STOCK_YOY']);
  expect(regimeInputsOf('US').map(d=>d.id)).toEqual(['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY']);
  expect(regimeInputsOf('CN').map(d=>d.id)).toEqual(['CN_CPI_YOY','CN_PPI_YOY','CN_PMI_MFG','CN_GDP_YOY','CN_M2_YOY','CN_EXPORT_YOY','CN_CGB_10Y','CN_USDCNY_CP']);
  for(const r of ['US','CN'] as const)for(const d of regimeInputsOf(r))expect(d.nativeFrequency).not.toBe('daily');
 });
 it('collectableOf lists active native (own-evidence) series per adapter',()=>{
  expect(collectableOf('fred_csv').map(d=>d.source!.seriesKey)).toEqual(['DFF','DFEDTARU','DFEDTARL','DFEDTAR','DGS10','DTWEXBGS','CPIAUCSL','UNRATE','PPIFIS','DCOILWTICO']);
  expect(collectableOf('akshare').map(d=>d.id)).toEqual(['CN_CPI_INDEX','CN_PPI_INDEX','CN_PMI_MFG','CN_GDP_INDEX','CN_M2_YOY','CN_EXPORT_YOY','CN_CGB_10Y_D','CN_USDCNY_CP_D']);
  for(const d of [...collectableOf('fred_csv'),...collectableOf('akshare')]){expect(d.derive).toBeUndefined();expect(d.aliasOf).toBeUndefined();}
 });
 it('catalogById answers undefined for unknown ids; the catalog is deeply frozen',()=>{
  expect(catalogById('NOPE')).toBeUndefined();
  expect(Object.isFrozen(MACRO_CATALOG)).toBe(true);
  expect(Object.isFrozen(catalogById('US_UNRATE')!.source)).toBe(true);
  expect(Object.isFrozen(catalogById('US_UNRATE')!.source!.publisher)).toBe(true);
 });
});

describe('CATALOG_VERSION',()=>{
 it('pure-TS SHA-256 equals node:crypto',()=>{
  for(const s of ['','abc','中文 ✓','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'b'.repeat(1000)])expect(sha256HexSync(s)).toBe(createHash('sha256').update(s,'utf8').digest('hex'));
 });
 it('canonicalJson sorts keys, drops undefined, keeps array order, refuses non-finite numbers',()=>{
  expect(canonicalJson({b:1,a:[3,{d:undefined,c:'x'}],e:null})).toBe('{"a":[3,{"c":"x"}],"b":1,"e":null}');
  expect(()=>canonicalJson({a:Number.NaN})).toThrow('canonical_json_unsupported');
 });
 it('is macro-catalog/ + 12 hex of the canonical catalog JSON, stable across evaluations',()=>{
  expect(CATALOG_VERSION).toMatch(/^macro-catalog\/[0-9a-f]{12}$/);
  expect(CATALOG_VERSION).toBe(`macro-catalog/${createHash('sha256').update(canonicalJson(MACRO_CATALOG)).digest('hex').slice(0,12)}`);
  expect(canonicalJson(JSON.parse(JSON.stringify(MACRO_CATALOG)))).toBe(canonicalJson(MACRO_CATALOG));   // what macro_upsert_catalog stores hashes the same
 });
});

describe('judgment contract mirror',()=>{
 it('keeps the F4 regime tie-break order',()=>{expect(REGIMES).toEqual(['recovery','overheat','stagflation','recession']);});
});
