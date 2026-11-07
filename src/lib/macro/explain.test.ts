// Rule-generated statistical sentence (spec §7): strength words only for change; sign tied to the printed r.
import {describe,expect,it} from 'vitest';
import type {EventResult,PairResult,RollingResult} from './correlation';
import {explainResult,strengthOf} from './explain';
const names={indicator:{zh:'联邦基金利率',en:'Fed funds rate'},asset:{zh:'10 年美债收益率',en:'UST 10Y yield'}};
const pair=(o:Partial<PairResult>):PairResult=>({kind:'change',r:-0.29,r2:0.0841,slope:-1,intercept:0,n:119,from:'2016-11',to:'2026-10',lag:0,transform:'change',exploratory:false,x_unit:'bp',y_unit:'bp',pairs:[],method_version:'macro-correlation/1',code_version:'x',...o});
describe('explain',()=>{
 it('strength thresholds',()=>{
  expect(strengthOf(0.29).en).toBe('weak');expect(strengthOf(-0.3).en).toBe('moderate');expect(strengthOf(0.59).en).toBe('moderate');expect(strengthOf(-0.6).en).toBe('strong');
 });
 it('change: strength + sign word bound to r, no causal claim',()=>{
  const e=explainResult(pair({}),names);
  expect(e.zh).toContain('r = -0.29');expect(e.zh).toContain('弱负相关');expect(e.zh).toContain('不代表因果');
  expect(e.en).toContain('weak negative correlation');
  expect(explainResult(pair({r:0.45,r2:0.2025,lag:3}),names).zh).toMatch(/中等正相关.*指标领先 3 个月/);
  expect(explainResult(pair({r:0.45,r2:0.2025,lag:-2}),names).en).toContain('asset leads by 2 months');
 });
 it('near-zero r gets no direction word',()=>{
  const e=explainResult(pair({r:-0.004,r2:0.000016}),names);
  expect(e.zh).toContain('近零相关');expect(e.zh).not.toMatch(/[正负]相关/);
 });
 it('level: exploratory label and no strength words',()=>{
  const e=explainResult(pair({kind:'level',transform:'level',exploratory:true,r:0.81,r2:0.6561,x_unit:'level',y_unit:'level'}),names);
  expect(e.zh).toContain('探索性');expect(e.zh).not.toMatch(/弱|中等|强/);expect(e.en).not.toMatch(/weak|moderate|strong/);
 });
 it('rolling and event window',()=>{
  const roll:RollingResult={kind:'rolling',window_months:36,min_pairs:30,lag:0,points:[{end:'2020-01',r:-0.2,n:36},{end:'2020-02',r:0.4,n:36}],from:'2020-01',to:'2020-02',method_version:'m',code_version:'c'};
  expect(explainResult(roll,names).zh).toContain('r 介于 -0.20 与 0.40 之间');
  const ev:EventResult={kind:'event_window',n_months:6,events:[],candidates:3,independent:3,dropped:[],stats:null,y_unit:'bp',method_version:'m',code_version:'c'};
  expect(explainResult(ev,names).zh).toContain('少于 5 个');
  expect(explainResult({...ev,independent:6,stats:{pre:{median:1,q1:0,q3:2},post:{median:-12.5,q1:-20,q3:-3}}},names).zh).toContain('中位数 -12.50 bp');
 });
});
