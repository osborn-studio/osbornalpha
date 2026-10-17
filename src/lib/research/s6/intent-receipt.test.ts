import {readFileSync} from 'node:fs';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {digest,inputDigest} from 'dsh-trade-strategy-evaluator/engine';
import {verifyStoredIntent} from './intent-receipt';
// Simulate removal of the historical evaluator, not replacement of a stored row.
const forbidden=vi.hoisted(()=>({engine:vi.fn(()=>{throw Error('historical engine unavailable');}),adapter:vi.fn(()=>{throw Error('current adapter forbidden');})}));
vi.mock('dsh-trade-strategy-evaluator/engine',async original=>({...await original<object>(),evaluateObservation:forbidden.engine}));
vi.mock('dsh-trade-strategy-evaluator/adapters',()=>({validateCommit:forbidden.adapter}));
afterEach(()=>{expect(forbidden.engine).not.toHaveBeenCalled();expect(forbidden.adapter).not.toHaveBeenCalled();vi.clearAllMocks();});
function fixture(){
 // Minimal synthetic historical payload: this checker verifies durable hashes,
 // not whether a new evaluation satisfies today's engine schema.
 const input=JSON.parse(JSON.stringify({observation:{id:'synthetic-observation',market_policy_version:'historical-policy/0'},market_snapshots:[],market_snapshot_sha256s:[]}));
 input.observation_sha256=digest(input.observation);input.input_sha256=inputDigest(input);
 const result={engine_version:'retired-synthetic-engine/0',rule_version:'historical-policy/0',status:'synthetic'},key='synthetic-key';
 const body={schema_version:'evaluator-rpc/1.0',observation_ref:{id:input.observation.id,sha256:input.observation_sha256},market_snapshot_refs:[],engine_version:result.engine_version,rule_version:result.rule_version,input_sha256:input.input_sha256,input,result,result_sha256:digest(result),expected_revision:2,idempotency_key:key,request_key:key};
 return {user_id:'synthetic-owner',id:'synthetic-evaluation',observation_id:input.observation.id,idempotency_key:key,body_hash:digest(body),input,result,result_hash:digest(result),receipt:{schema_version:'evaluator-rpc/1.0',owner_scope:{user_id:'synthetic-owner',workspace_id:null},status:'accepted',observation_ref:input.observation.id,revision:3,idempotency_key:key,input_sha256:input.input_sha256,result_sha256:digest(result),evaluation_ref:'synthetic-evaluation'}} as unknown as Parameters<typeof verifyStoredIntent>[0];
}
describe('historical intent receipt consistency',()=>{
 it('verifies literal hashes from a real accepted synthetic row with two snapshots',()=>{
  const row=JSON.parse(readFileSync('src/lib/research/s6/fixtures/intent-receipt-v1.synthetic.json','utf8'));
  expect(row.input.market_snapshots).toHaveLength(2);expect(row.receipt.revision).toBeGreaterThan(0);
  expect(verifyStoredIntent(row,row.user_id,row.observation_id,row.idempotency_key)).toBe(row.id);
 });
 it.each(['order','body'])('rejects same-length frozen snapshot %s corruption',mode=>{
  const row=JSON.parse(readFileSync('src/lib/research/s6/fixtures/intent-receipt-v1.synthetic.json','utf8'));
  if(mode==='order'){row.input.market_snapshots.reverse();row.input.market_snapshot_sha256s.reverse();}
  else row.input.market_snapshots[0].id='edited';
  expect(()=>verifyStoredIntent(row,row.user_id,row.observation_id,row.idempotency_key)).toThrow('hash_mismatch');
 });
 it('keeps receipt validation independent of evaluation entrypoints',()=>{
  const source=readFileSync('src/lib/research/s6/intent-receipt.ts','utf8');
  expect(source).not.toMatch(/\b(?:evaluateObservation|validateCommit|makeCommit)\b/);
  expect(source).toContain("import {digest,inputDigest} from 'dsh-trade-strategy-evaluator/engine'");
 });
 it('resolves a durable historical receipt without invoking the installed evaluator',()=>{expect(verifyStoredIntent(fixture(),'synthetic-owner','synthetic-observation','synthetic-key')).toBe('synthetic-evaluation');});
 it.each(['owner','observation','key','revision','body','result','input','receipt','workspace','market','malformed'])('fails closed on %s corruption',field=>{
  const row=fixture();
  if(field==='owner')row.user_id='other';if(field==='observation')row.observation_id='other';if(field==='key')row.idempotency_key='other';
  if(field==='revision')row.receipt.revision++;if(field==='body')row.body_hash='0'.repeat(64);if(field==='result')row.result_hash='0'.repeat(64);
  if(field==='input')row.input.observation_sha256='0'.repeat(64);if(field==='receipt')row.receipt.evaluation_ref='other';
  if(field==='workspace')Object.assign(row.receipt.owner_scope,{workspace_id:'other'});
  if(field==='market')row.input.market_snapshot_sha256s.push('0'.repeat(64));
  if(field==='malformed')Object.assign(row,{input:null});
  expect(()=>verifyStoredIntent(row,'synthetic-owner','synthetic-observation','synthetic-key')).toThrow('hash_mismatch');
 });
});
