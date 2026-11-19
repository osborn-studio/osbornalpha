import {expect,it,vi} from 'vitest';
import {EXPLAIN_MAX_OUTPUT_TOKENS} from '@/lib/macro/strategy/llm-deps';
import {topicLlmDeps} from './llm-deps';

const m=vi.hoisted(()=>({owner:vi.fn(),platform:vi.fn(),begin:vi.fn(),run:vi.fn(),finalize:vi.fn()}));
vi.mock('@/lib/llm/resolve',()=>({resolveUserLlm:m.owner,resolveLlm:m.platform}));
vi.mock('@/lib/billing/quota',()=>({beginUsageRun:m.begin,finalizeUsageRun:m.finalize}));
vi.mock('@/lib/billing/metered-llm',()=>({runMeteredLlmCall:m.run,meteredUsageFromError:()=>undefined}));
vi.mock('@/lib/billing/cost-budget',()=>({getBudgetConfig:()=>({usdCnyMicros:7_200_000})}));
vi.mock('@/lib/billing/llm-concurrency',()=>({PERSONA_CONCURRENCY_HARD_CAP:4,
 createConcurrencyLimiter:()=>({runWithBudgetRetry:<T,>(call:()=>Promise<T>)=>call()})}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:vi.fn()}));

it('meters the owner-configured summary provider and persists only a safe provider error code',async()=>{
 m.owner.mockResolvedValue({provider:'openai',model:'fixture',source:'user'});
 const d=topicLlmDeps('owner');
 expect(await d.resolve()).toEqual({provider:'openai',model:'fixture',byo:true});
 expect(m.owner).toHaveBeenCalledOnce();expect(m.platform).not.toHaveBeenCalled();
 await d.begin('key',{});
 expect(m.begin).toHaveBeenCalledWith('owner','key','topic_summary',expect.anything());
 m.run.mockRejectedValueOnce(new Error('provider diagnostic detail'));
 await expect(d.call('prompt','facts')).rejects.toThrow(/^provider_error$/);
 expect(m.run).toHaveBeenCalledWith(expect.objectContaining({feature:'topic_summary',maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS}));
 await d.finalize('key',{status:'failed'});
 expect(m.finalize).toHaveBeenCalledWith('owner','key','topic_summary',{status:'failed'});
});
