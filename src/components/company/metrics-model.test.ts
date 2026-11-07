import {describe,it,expect} from 'vitest';
import {metricsGrid,metricText,basedOnRevOf} from './metrics-model';
import type {MetricEntry,MetricsResponse} from '@/lib/company/client';

const d=(metric:string,periodStart:string,periodEnd:string,duration:string,value:string,unit='pure',inputUnit='CNY',basis='cn_standard'):MetricEntry=>({metric,periodStart,periodEnd,duration,inputUnit,basis,basedOnRev:4182,computedAt:'2026-11-02T04:10:00Z',computedAtKind:'materialized',cell:{kind:'derived',metric,value,unit,inputUnit,basis,formulaVersion:'facts-derive/1.0',inputs:[]}});
const resp=(metrics:MetricEntry[],o:Partial<MetricsResponse>={}):MetricsResponse=>({issuerId:'i',ticker:'600519.SH',market:'CN',asOf:null,mappingGen:1,formulaVersion:'facts-derive/1.0',stale:false,truncated:false,metrics,evidence:{},withheld:{evidenceIncomplete:0,citationPending:0},...o});

describe('metricsGrid',()=>{
 it('rows follow the metric list (extras appended), columns are period keys newest first, clipped',()=>{
  const r=resp([d('gross_margin','2025-01-01','2025-06-30','6M','0.9186'),d('gross_margin','2025-01-01','2025-03-31','3M','0.9205'),d('zz_extra','2025-04-01','2025-06-30','3M','1'),
   {...d('revenue_yoy','2025-01-01','2025-06-30','6M','0'),cell:{kind:'withheld',reason:'citation_pending',factId:'f'}}]);
  const g=metricsGrid(r,['gross_margin','revenue_yoy'],2);
  expect(g.cols.map(c=>c.key)).toEqual(['2025-01-01:2025-06-30:6M','2025-04-01:2025-06-30:3M']);
  expect(g.rows.map(x=>x.metric)).toEqual(['gross_margin','revenue_yoy','zz_extra']);
  expect(g.rows[0].cells['2025-04-01:2025-06-30:3M']).toBeUndefined();
  expect(g.rows[1].cells['2025-01-01:2025-06-30:6M']?.cell.kind).toBe('withheld');
 });
 it('same metric and period in two input currencies are two rows, never overwritten; a withheld alternative keeps its identity (计划第 3 轮审计 R6)',()=>{
  const usd=d('fcf','2024-01-01','2024-12-31','12M','99000000000','USD','USD','us_standard');
  const eur={...d('fcf','2024-01-01','2024-12-31','12M','0','EUR','EUR','us_standard'),cell:{kind:'withheld' as const,reason:'evidence_incomplete' as const,factId:'e'}};
  const g=metricsGrid(resp([usd,eur]),['fcf','roe'],8);
  expect(g.rows.map(r=>[r.metric,r.inputUnit,r.basis,r.alt])).toEqual([['fcf','EUR','us_standard',0],['fcf','USD','us_standard',1],['roe',null,null,0]]);
  expect(g.rows[0].cells['2024-01-01:2024-12-31:12M']?.cell.kind).toBe('withheld');
  expect(g.rows[1].cells['2024-01-01:2024-12-31:12M']).toBe(usd);
  expect(g.rows[1].id).toBe(JSON.stringify(['fcf','USD','us_standard']));
 });
 it('formats ratios as 2-decimal percents and money by scale; reports basedOnRev',()=>{
  expect(metricText(d('gross_margin','a','b','6M','0.918612'),8)).toBe('91.86%');
  expect(metricText(d('fcf','a','b','6M','39649000000','CNY'),8)).toBe('396.49');
  expect(basedOnRevOf(resp([d('gross_margin','a','b','6M','1')]))).toBe(4182);
  expect(basedOnRevOf(resp([]))).toBeNull();
 });
});
