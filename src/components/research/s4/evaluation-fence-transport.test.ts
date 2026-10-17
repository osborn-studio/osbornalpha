import {afterEach,describe,expect,it,vi} from 'vitest';
import * as journal from './evaluation-journal';
const observation='11111111-1111-4111-8111-111111111111',scope='a'.repeat(64);
const handle={action:'recover-evaluation' as const,key:'synthetic-key',snapshotDigest:'b'.repeat(64)};
const accepted={journalScope:scope,observationId:observation,status:'fenced',key:handle.key,revision:1,recordId:'22222222-2222-4222-8222-222222222222'};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('fence confirmation transport',()=>{
 it('exports no response parser and sends only the minimal projection',async()=>{
  expect('confirmEvaluationFence' in journal).toBe(false);
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(accepted),{status:200}));vi.stubGlobal('fetch',fetcher);
  const ack=await journal.requestEvaluationFence(observation,scope,handle);
  expect(ack).toMatchObject({key:handle.key,revision:1,recordId:accepted.recordId,scope,snapshotDigest:handle.snapshotDigest});
  const [url,options]=fetcher.mock.calls[0];expect(url).toBe(`/api/research/s6/observations/${observation}`);
  expect(options).toMatchObject({method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store'});
  expect(JSON.parse(options.body)).toEqual({action:'fence-intents',key:handle.key});
  expect(options.body).not.toContain(scope);expect(options.body).not.toContain(handle.snapshotDigest);
 });
 it.each([401,403,409,500])('rejects HTTP %s even with success-shaped body',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(accepted),{status})));
  await expect(journal.requestEvaluationFence(observation,scope,handle)).rejects.toThrow('evaluation_journal_unavailable');
 });
 it.each(['not-json',JSON.stringify({...accepted,key:'another-key'}),JSON.stringify({...accepted,revision:0})])('rejects invalid confirmation',async body=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(body)));
  await expect(journal.requestEvaluationFence(observation,scope,handle)).rejects.toThrow('evaluation_journal_unavailable');
 });
 it.each([{...accepted,journalScope:'c'.repeat(64)},{...accepted,observationId:'33333333-3333-4333-8333-333333333333'},{...accepted,journalScope:undefined}])('rejects a confirmation from a different scope or observation',async body=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
  await expect(journal.requestEvaluationFence(observation,scope,handle)).rejects.toThrow('evaluation_journal_unavailable');
 });
 it('rejects destination traversal without dispatch',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(journal.requestEvaluationFence('../other',scope,handle)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
 it('aborts a stalled request and returns no confirmation',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal!.addEventListener('abort',()=>reject(Error('synthetic_abort')));})));
  const outcome=journal.requestEvaluationFence(observation,scope,handle).catch(error=>error);
  await vi.advanceTimersByTimeAsync(15000);expect(signal?.aborted).toBe(true);expect(await outcome).toBeInstanceOf(journal.EvaluationJournalError);expect(vi.getTimerCount()).toBe(0);
 });
});
