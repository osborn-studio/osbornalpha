// src/lib/dcf/assemble.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/llm/resolve',()=>({resolveUserLlm:async()=>null}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:vi.fn(),extractJson:(s:string)=>JSON.parse(s)}));
import {assembleAssumptions,layerOf,mergeLayers,factLayer} from './assemble';
import type {DcfWarning,LlmFill} from './assemble';
import type {SeedResult} from '@/lib/company/dcf-seed';

const leaf=(value:number,divisor='1000000')=>({source:'fact' as const,value,factIds:['f'],divisor,basis:'b',periodEnd:'2023-09-30',unit:'USD'});
const fullSeed=():SeedResult=>({seed:{baseRevenue:383285,grossMarginPct:0.44,sharesDiluted:15550.061,netDebt:75138},
 provenance:{'revenueLines[0].baseRevenue':leaf(383285),grossMarginPct:{...leaf(0.44,'1'),metric:'gross_margin'},sharesDiluted:leaf(15550.061),netDebt:leaf(75138)},
 missing:[],meta:{currency:'USD',currencyUnit:'百万',divisor:'1000000'},evidence:{}});
const noShares=():SeedResult=>{const s=fullSeed();delete s.seed.sharesDiluted;delete s.provenance.sharesDiluted;s.missing=[{field:'sharesDiluted',reason:'share_basis_unverified'}];return s;};

describe('assembleAssumptions (spec §9.1)',()=>{
 it('merge order defaults < LLM < facts < user by leaf; LLM cagr kept while baseRevenue stays fact',async()=>{
  const llm=vi.fn<LlmFill>(async()=>({revenueLines:[{cagr:0.12}],grossMarginPct:0.9,sgaPct:0.2}));
  const r=await assembleAssumptions('AAPL','US',fullSeed(),{wacc:0.09},llm);
  expect(r.status).toBe('ok');
  expect(r.assumptions!.revenueLines).toEqual([{name:'合计',baseRevenue:383285,cagr:0.12}]);
  expect(r.provenance).toMatchObject({'revenueLines[0].baseRevenue':'fact','revenueLines[0].cagr':'llm',grossMarginPct:'fact',sgaPct:'llm',rdPct:'default',wacc:'user',sharesDiluted:'fact',netDebt:'fact'});
  expect(r.assumptions!.grossMarginPct).toBe(0.44);
  expect(r.assumptions).toMatchObject({currency:'USD',currencyUnit:'百万'});
  expect(llm.mock.calls[0][0]).toContain('百万 USD');
 });
 it('LLM returning two revenue lines and a baseRevenue: second line dropped, length 1, revenue total = fact, warnings',async()=>{
  const r=await assembleAssumptions('AAPL','US',fullSeed(),{},async()=>({revenueLines:[{name:'iPhone',baseRevenue:200000,cagr:0.05},{name:'Services',baseRevenue:85000,cagr:0.1}],sharesDiluted:1}));
  expect(r.assumptions!.revenueLines).toHaveLength(1);
  expect(r.assumptions!.revenueLines[0].baseRevenue).toBe(383285);
  expect(r.assumptions!.sharesDiluted).toBe(15550.061);
  const codes=r.warnings.map((w:DcfWarning)=>w.code);
  expect(codes).toContain('dcf_revenue_line_rejected');expect(codes).toContain('dcf_llm_field_rejected');
 });
 it('equity bridge without a fact and without user confirmation → unavailable, missing listed, LLM never called',async()=>{
  const llm=vi.fn<LlmFill>(async()=>({sharesDiluted:999}));
  const r=await assembleAssumptions('AAPL','US',noShares(),{},llm);
  expect(r).toMatchObject({status:'unavailable',assumptions:null,missing:[{field:'sharesDiluted',reason:'share_basis_unverified'}]});
  expect(llm).not.toHaveBeenCalled();
 });
 it('a fact seed fully overridden by the user still warns no-facts (final provenance, plan audit Q7)',async()=>{
  const r=await assembleAssumptions('AAPL','US',fullSeed(),{revenueLines:[{baseRevenue:1}],grossMarginPct:0.5,sharesDiluted:2,netDebt:3},async()=>null);
  expect(r.status).toBe('ok');expect(Object.values(r.provenance)).not.toContain('fact');
  expect(r.warnings.map(w=>w.code)).toContain('dcf_no_facts');
 });
 it('user-confirmed bridge runs; with no fact leaf at all the no-facts warning appears',async()=>{
  const ok=await assembleAssumptions('AAPL','US',noShares(),{sharesDiluted:15000},async()=>null);
  expect(ok.status).toBe('ok');expect(ok.provenance.sharesDiluted).toBe('user');
  expect(ok.warnings.map(w=>w.code)).toContain('dcf_llm_unconfigured');
  const empty:SeedResult={seed:{},provenance:{},missing:[],meta:{currency:null,currencyUnit:null,divisor:null},evidence:{}};
  const r=await assembleAssumptions('600519.SH','CN',empty,{revenueLines:[{baseRevenue:1500}],sharesDiluted:12.56,netDebt:-690},async()=>{throw new Error('x');});
  expect(r.status).toBe('ok');
  expect(r.assumptions).toMatchObject({currency:'CNY',currencyUnit:'亿'});
  expect(r.warnings.map(w=>w.code)).toEqual(expect.arrayContaining(['dcf_llm_failed','dcf_no_facts']));
  for(const v of [r.assumptions!.wacc,r.assumptions!.terminalG,r.assumptions!.taxRate,r.assumptions!.revenueLines[0].cagr])expect(Number.isFinite(v)).toBe(true);
 });
 it('layer rules: LLM may not write baseRevenue, bridge or other scalars; user may',()=>{
  const w:DcfWarning[]=[];
  expect([...layerOf('llm',{wacc:0.5,netDebt:1,taxRate:0.2},w).keys()]).toEqual(['taxRate']);
  expect([...layerOf('user',{wacc:0.5,netDebt:1,revenueLines:[{baseRevenue:3,name:'x'}]},w).keys()].sort()).toEqual(['netDebt','revenueLines[0].baseRevenue','revenueLines[0].name','wacc']);
  const m=mergeLayers({defaults:new Map(),llm:new Map([['grossMarginPct',0.9]]),facts:factLayer(fullSeed()),user:new Map()});
  expect(m.provenance.grossMarginPct).toBe('fact');
 });
});
