// Production LlmDeps (spec §6.3): the perspectives-route metering calls in order, BYO vs platform, fail-open quota,
// failure accounting carried on the thrown error, finalizePayload aggregates once (JSON-safe), finalize sends it verbatim.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PRICING_VERSION} from '@/lib/billing/llm-pricing';
import type {MeteredUsage} from '@/lib/billing/metered-llm';

const m=vi.hoisted(()=>({resolve:vi.fn(),checkQuota:vi.fn(),begin:vi.fn(),finalize:vi.fn(),run:vi.fn(),fromErr:vi.fn(),chat:vi.fn(),persona:vi.fn(),plain:vi.fn()}));
vi.mock('@/lib/llm/resolve',()=>({resolveLlm:m.resolve}));
vi.mock('@/lib/billing/quota',()=>({checkQuota:m.checkQuota,beginUsageRun:m.begin,finalizeUsageRun:m.finalize}));
vi.mock('@/lib/billing/metered-llm',async(orig)=>({...await orig<typeof import('@/lib/billing/metered-llm')>(),runMeteredLlmCall:m.run,meteredUsageFromError:m.fromErr}));
vi.mock('@/lib/billing/llm-concurrency',()=>({PERSONA_CONCURRENCY_HARD_CAP:4,createPersonaConcurrencyLimiter:m.persona,createConcurrencyLimiter:m.plain}));
vi.mock('@/lib/billing/cost-budget',async(orig)=>({...await orig<typeof import('@/lib/billing/cost-budget')>(),getBudgetConfig:()=>({dailyLimitMicrormb:8_800_000,usdCnyMicros:7_200_000,reservationTtlSeconds:60})}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:m.chat}));

import {LlmCallError} from './explain-request';
import {EXPLAIN_MAX_OUTPUT_TOKENS,productionLlmDeps} from './llm-deps';

const ENV_LLM={provider:'deepseek',model:'deepseek-chat',protocol:'openai',source:'env',baseUrl:'https://x',apiKey:'k'};
const USER_LLM={...ENV_LLM,provider:'openai',model:'gpt-x',source:'user'};
const usage=(o:Partial<MeteredUsage>={}):MeteredUsage=>({status:'completed',provider:'deepseek',model:'deepseek-chat',usage:{inputTokens:100,cacheHitInputTokens:10,cacheMissInputTokens:90,outputTokens:50,estimated:false},costMicrormb:300,usageEstimated:false,byo:false,...o});
const limiter={limit:1,run:<T,>(f:()=>Promise<T>)=>f(),runWithBudgetRetry:<T,>(f:()=>Promise<T>)=>f()};

describe('productionLlmDeps',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.resolve.mockResolvedValue(ENV_LLM);m.persona.mockReturnValue(limiter);m.plain.mockReturnValue(limiter);
  m.begin.mockResolvedValue(undefined);m.finalize.mockResolvedValue(undefined);
  m.chat.mockResolvedValue({content:'{"points":[]}',usage:usage().usage});
  m.run.mockImplementation(async(a:{call:()=>Promise<unknown>})=>({value:await a.call(),accounting:usage()}));
 });
 it('resolve maps the resolved provider; env = platform, user = BYO; none → null',async()=>{
  expect(await productionLlmDeps('u1').resolve()).toEqual({provider:'deepseek',model:'deepseek-chat',byo:false});
  m.resolve.mockResolvedValueOnce(USER_LLM);
  expect(await productionLlmDeps('u1').resolve()).toEqual({provider:'openai',model:'gpt-x',byo:true});
  m.resolve.mockResolvedValueOnce(null);
  expect(await productionLlmDeps('u1').resolve()).toBeNull();
 });
 it('checkQuota uses the perspectives feature, fails open on errors and rethrows not authenticated',async()=>{
  const d=productionLlmDeps('u1');
  m.checkQuota.mockResolvedValueOnce({allowed:false,used:5,limit:5,plan:'free'});
  expect(await d.checkQuota()).toEqual({allowed:false,used:5,limit:5});
  expect(m.checkQuota).toHaveBeenCalledWith('perspectives');
  m.checkQuota.mockRejectedValueOnce(new Error('db down'));
  expect(await d.checkQuota()).toBeNull();
  m.checkQuota.mockRejectedValueOnce(new Error('not authenticated'));
  await expect(d.checkQuota()).rejects.toThrow('not authenticated');
 });
 it('begin builds the persona limiter for platform keys, then beginUsageRun with pricing metadata',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();await d.begin('00000000-0000-4000-8000-0000000000e1',{});
  expect(m.persona).toHaveBeenCalledWith({provider:'deepseek',model:'deepseek-chat',maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS});
  expect(m.begin).toHaveBeenCalledWith('u1','00000000-0000-4000-8000-0000000000e1','perspectives',{provider:'deepseek',model:'deepseek-chat',pricingVersion:PRICING_VERSION,usdCnyMicros:7_200_000,byo:false});
  expect(m.persona.mock.invocationCallOrder[0]).toBeLessThan(m.begin.mock.invocationCallOrder[0]);
 });
 it('begin for BYO uses the plain limiter and no pricing metadata; begin errors propagate with their code',async()=>{
  m.resolve.mockResolvedValueOnce(USER_LLM);
  const d=productionLlmDeps('u1');await d.resolve();await d.begin('k',{});
  expect(m.plain).toHaveBeenCalledWith(4);
  expect(m.begin).toHaveBeenCalledWith('u1','k','perspectives',{provider:'openai',model:'gpt-x',pricingVersion:undefined,usdCnyMicros:undefined,byo:true});
  m.begin.mockRejectedValueOnce(new Error('usage_audit_unavailable'));
  await expect(d.begin('k2',{})).rejects.toThrow('usage_audit_unavailable');
 });
 it('call runs one metered perspectives call through the limiter; budget exemption follows an unlimited quota',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();
  m.checkQuota.mockResolvedValueOnce({allowed:true,used:0,limit:-1,plan:'pro'});await d.checkQuota();
  await d.begin('k',{});
  expect(await d.call('SYS','USER')).toEqual({content:'{"points":[]}',accounting:usage()});
  expect(m.run).toHaveBeenCalledTimes(1);
  expect(m.run.mock.calls[0][0]).toMatchObject({feature:'perspectives',userId:'u1',budgetExempt:true,maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS,provider:ENV_LLM});
  expect(m.chat).toHaveBeenCalledWith(ENV_LLM,{system:'SYS',messages:[{role:'user',content:'USER'}],max_tokens:EXPLAIN_MAX_OUTPUT_TOKENS,temperature:0.2,timeoutMs:30_000,responseJson:true});
 });
 it('call before begin is refused without any provider call',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();
  await expect(d.call('s','u')).rejects.toThrow('usage_run_not_started');
  expect(m.run).not.toHaveBeenCalled();
 });
 it('a failed call throws LlmCallError with the message (cost codes kept) and the failed accounting row',async()=>{
  const boom=new Error('daily_cost_exhausted');const failed=usage({status:'failed',costMicrormb:120});
  m.run.mockRejectedValueOnce(boom);m.fromErr.mockReturnValueOnce(failed);
  const d=productionLlmDeps('u1');await d.resolve();await d.begin('k',{});
  const err=await d.call('s','u').catch((e:unknown)=>e);
  expect(err).toBeInstanceOf(LlmCallError);
  expect(err).toMatchObject({message:'daily_cost_exhausted',accounting:failed});
  expect(m.fromErr).toHaveBeenCalledWith(boom);
  m.run.mockRejectedValueOnce('weird');m.fromErr.mockReturnValueOnce(undefined);
  await expect(d.call('s','u')).rejects.toMatchObject({message:'weird',accounting:null});
 });
 it('finalizePayload is the aggregate of the accounting rows, or the resolved provider with zero usage; finalize sends a payload verbatim',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();
  const p=d.finalizePayload('completed',[usage(),usage({costMicrormb:200}),null]);
  expect(p).toEqual({provider:'deepseek',model:'deepseek-chat',inputTokens:200,cacheHitInputTokens:20,cacheMissInputTokens:180,outputTokens:100,costMicrormb:500,pricingVersion:PRICING_VERSION,usdCnyMicros:7_200_000,usageEstimated:false,byo:false,status:'completed'});
  expect(m.finalize).not.toHaveBeenCalled();                                   // computing the payload settles nothing
  await d.finalize('k',p);
  expect(m.finalize).toHaveBeenCalledWith('u1','k','perspectives',p);
  const failed=d.finalizePayload('failed',[]);
  expect(failed).toEqual({provider:'deepseek',model:'deepseek-chat',inputTokens:0,cacheHitInputTokens:0,cacheMissInputTokens:0,outputTokens:0,costMicrormb:0,pricingVersion:PRICING_VERSION,usdCnyMicros:7_200_000,usageEstimated:true,byo:false,status:'failed'});
  await d.finalize('k2',JSON.parse(JSON.stringify(failed)));                  // a payload read back from the run row
  expect(m.finalize).toHaveBeenLastCalledWith('u1','k2','perspectives',failed);
 });
 it('BYO payloads carry no pricing version or FX and survive a JSON round trip unchanged',async()=>{
  m.resolve.mockResolvedValueOnce(USER_LLM);
  const d=productionLlmDeps('u1');await d.resolve();
  const p=d.finalizePayload('failed',[]);
  expect(p).toEqual({provider:'openai',model:'gpt-x',inputTokens:0,cacheHitInputTokens:0,cacheMissInputTokens:0,outputTokens:0,costMicrormb:0,usageEstimated:true,byo:true,status:'failed'});
  expect(JSON.parse(JSON.stringify(p))).toEqual(p);
 });
});
