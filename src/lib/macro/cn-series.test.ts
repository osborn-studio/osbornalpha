// src/lib/macro/cn-series.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {collectableOf} from './catalog';
import {cnSeriesDocument,cnSeriesSpecs,cnSpecOf} from './cn-series';
import type {MacroSeriesDef} from './types';

const def=(id:string,seriesKey:string,fetchHost:string,period:MacroSeriesDef['period']='month'):MacroSeriesDef=>({
 id,region:'CN',role:'indicator',type:null,name:{zh:id,en:id},unit:'pct',nativeFrequency:'monthly',period,adjustment:'nsa',status:'active',
 source:{adapter:'akshare',fetchHost,publisher:{zh:'x',en:'x'},seriesKey,rights:'official_open',attribution:{zh:'x',en:'x'}},
 revisionPolicy:'immutable',weight:0,changeKind:'pp',definitionVersion:1,
});

describe('cnSpecOf',()=>{
 it('splits an NBS key into kind, tree path and whitespace-free indicator, with daily and history calls',()=>{
  const s=cnSpecOf(def('CN_PMI_MFG','macro_china_nbs_nation|月度数据|采购经理指数 > 制造业采购经理指数 > 制造业采购经理指数 (%)','data.stats.gov.cn'));
  expect(s).toEqual({series_id:'CN_PMI_MFG',fetch_host:'data.stats.gov.cn',period:'month',function:'macro_china_nbs_nation',
   evidence_path:'/dg/website/publicrelease/web/external/stream/esData',column:'制造业采购经理指数(%)',kind:'月度数据',
   path:'采购经理指数 > 制造业采购经理指数',daily_period:'LAST13',backfill:[{path:'采购经理指数 > 制造业采购经理指数',period:'2016-'}]});
  expect(cnSpecOf(def('CN_GDP_INDEX','macro_china_nbs_nation|季度数据|国民经济核算 > 国内生产总值指数 > 国内生产总值指数(上年同期=100)当季值','data.stats.gov.cn','quarter')).daily_period).toBe('LAST8');
  expect(cnSpecOf(def('CN_CPI_INDEX','macro_china_nbs_nation|月度数据|价格指数 > 居民消费价格分类指数(上年同月=100) > 全国居民消费价格分类指数(上年同月=100)(2026-) > 居民消费价格指数(上年同月=100)','data.stats.gov.cn')).backfill!.map(b=>b.period)).toEqual(['2026-','2021-2025','2016-2020']);
  const cpi=cnSeriesSpecs().find(x=>x.series_id==='CN_CPI_INDEX')!;
  expect(cpi.backfill![0]).toEqual({path:cpi.path,period:'2026-'});
  expect(cpi.path).toContain('(2026-)');
 });
 it('reads ChinaBond and SAFE keys',()=>{
  expect(cnSpecOf(def('CN_CGB_10Y_D','bond_china_yield|中债国债收益率曲线|10年','yield.chinabond.com.cn','day'))).toMatchObject({function:'bond_china_yield',curve:'中债国债收益率曲线',column:'10年',evidence_path:'/cbweb-pbc-web/pbc/historyQuery',window_days:45,backfill_from:'2016-01-01'});
  expect(cnSpecOf(def('CN_USDCNY_CP_D','currency_boc_safe|美元','www.safe.gov.cn','day'))).toMatchObject({function:'currency_boc_safe',column:'美元',evidence_path:'/AppStructured/hlw/RMBQuery.do'});
 });
 it('refuses unknown functions, malformed keys and non-akshare series',()=>{
  expect(()=>cnSpecOf(def('X','stock_zh_index_hist_csindex|000300','www.csindex.com.cn'))).toThrow('unsupported_series_key');
  expect(()=>cnSpecOf(def('X','macro_china_nbs_nation|月度数据|只有一段','data.stats.gov.cn'))).toThrow('bad_series_key');
  expect(()=>cnSpecOf({...def('X','a|b','h'),source:null})).toThrow('not_akshare');
 });
});

describe('catalog CN specs',()=>{
 it('covers every active native akshare series on the three verified official hosts',()=>{
  const specs=cnSeriesSpecs();
  expect(specs.map(s=>s.series_id)).toEqual(collectableOf('akshare').map(d=>d.id));
  for(const s of specs)expect(['data.stats.gov.cn','yield.chinabond.com.cn','www.safe.gov.cn'],s.series_id).toContain(s.fetch_host);
 });
 it('matches the committed scripts/macro/cn-series.json (re-run scripts/macro/export-cn-series.ts after catalog changes)',()=>{
  expect(readFileSync(new URL('../../../scripts/macro/cn-series.json',import.meta.url),'utf8')).toBe(cnSeriesDocument());
 });
});
