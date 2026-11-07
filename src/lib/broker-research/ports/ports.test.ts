// Port contracts: fixture validation, feature gates, and deterministic replay (spec §11.1).
import {afterEach,describe,expect,it,vi} from 'vitest';
import {F3Error,assertExtraction,fakeF3Port,productionF3Port} from './f3';
import {LlmError,REGISTRY_HASH,productionLlmPort,recordedLlmPort} from './llm';
import {pipelineExtraction} from '../fixtures/pipeline';
const SHA='b'.repeat(64);
describe('F3 port',()=>{
 it('checks content hash and page numbering',()=>{
  expect(()=>assertExtraction(pipelineExtraction(SHA),'c'.repeat(64))).toThrow(expect.objectContaining({code:'f3_failed'}));
  expect(()=>assertExtraction({...pipelineExtraction(SHA),page_count:9},SHA)).toThrow(F3Error);
  expect(assertExtraction(pipelineExtraction(SHA),SHA).page_count).toBe(3);
 });
 it('fake returns fixture; production remains unwired',async()=>{
  const f=fakeF3Port(()=>pipelineExtraction(SHA));expect(f.available()).toBe(true);
  expect((await f.extractDocument({bytes:new Uint8Array(),sha256:SHA,outputPrefix:'x',pagesPrefix:'y'},{deadline:new Date(),authorization:{licenceId:'l',licenceVersion:1,purpose:'broker_research'}})).page_count).toBe(3);
  expect(productionF3Port({}).available()).toBe(false);
  expect(productionF3Port({BROKER_RESEARCH_F3_ENABLED:'1'}).available()).toBe(false);
  await expect(productionF3Port({}).extractDocument({} as never,{} as never)).rejects.toMatchObject({code:'f3_unavailable'});
 });
});
describe('LLM port',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it('replays answers in order and records calls',async()=>{
  const p=recordedLlmPort(['a',new LlmError('llm_quota'),'c']);
  expect(p.info()).toMatchObject({modelId:'recorded-model',registryHash:REGISTRY_HASH});
  const req={system:'s',user:'u',maxTokens:10,responseJson:true,timeoutMs:1000};
  expect((await p.complete(req)).content).toBe('a');
  await expect(p.complete(req)).rejects.toMatchObject({code:'llm_quota'});
  expect((await p.complete(req)).content).toBe('c');
  await expect(p.complete(req)).rejects.toMatchObject({code:'llm_failed'});
  expect(p.calls).toHaveLength(4);
 });
 it('production requires flag and platform key',async()=>{
  expect(productionLlmPort({}).info()).toBeNull();
  await expect(productionLlmPort({}).complete({system:'',user:'',maxTokens:1,responseJson:false,timeoutMs:1})).rejects.toMatchObject({code:'llm_unavailable'});
  for(const k of ['LLM_PROVIDER','DEEPSEEK_API_KEY','ANTHROPIC_API_KEY','ARK_API_KEY','OPENAI_API_KEY','KIMI_API_KEY','MINIMAX_API_KEY'])vi.stubEnv(k,'');
  expect(productionLlmPort({BROKER_RESEARCH_LLM_ENABLED:'1'}).info()).toBeNull();
 });
 it('registry hash is stable sha256',()=>expect(REGISTRY_HASH).toMatch(/^[0-9a-f]{64}$/));
});
