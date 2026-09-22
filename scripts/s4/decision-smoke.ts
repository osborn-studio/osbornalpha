import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import assert from 'node:assert/strict';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {revealCards} from '../../src/lib/research/s4/cards';
import {submitDecision, type DecisionInput} from '../../src/lib/research/s4/decisions';
const state=JSON.parse(readFileSync(process.argv[2],'utf8'));
process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
const actor={userId:'99999999-9999-4999-8999-999999999999',kind:'agent' as const};
const admin=new Pool({connectionString:state.adminUrl});
async function main(){
  await admin.query(`insert into public.stocks_universe(ticker,name,market,exchange,currency,metadata) values('S4SYNTH','合成验收证券','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  const candidate=(await admin.query('select id,revision from public.research_s4_candidates where user_id=$1',[actor.userId])).rows[0];
  const revealed=await revealCards(actor,candidate.id,{requestKey:randomUUID(),judgment:'代理操作的合成工程验收，无独立投研判断。',alreadySeen:['S3 walkthrough'],independentJudgment:false});
  assert.equal(revealed.cards.length,1);assert.equal(revealed.cards[0].payload.recall_reason,'exploration');
  const input:DecisionInput={requestKey:randomUUID(),expectedRevision:candidate.revision,action:'observe',reason:'仅合成闭环验收，等待行情。',
    cardId:revealed.cards[0].id,labelId:revealed.labelId,exposureId:revealed.exposureId,securityTicker:'S4SYNTH',companyEntityId:null,newObservation:true,reviewAt:null};
  const attempts=[input,{...input,requestKey:randomUUID()}];
  const race=await Promise.allSettled(attempts.map(i=>submitDecision(actor,candidate.id,i)));
  const winningInput=attempts[race.findIndex(r=>r.status==='fulfilled')];
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  const winner=race.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;
  const replay=await submitDecision(actor,candidate.id,winningInput);assert.equal(replay.duplicate,true);
  await assert.rejects(()=>submitDecision(actor,candidate.id,{...winningInput,reason:'conflicting request'}),/idempotency_conflict/);
  const observed=(await admin.query('select payload,payload_hash from public.research_s4_records where id=$1',[winner.value.observationId])).rows[0];
  assert.equal(observed.payload.status,'pending_start');assert.equal(observed.payload.actual_start_at,null);assert.equal(observed.payload.research_stream,'descriptive');
  const deferred=await submitDecision(actor,candidate.id,{...input,requestKey:randomUUID(),expectedRevision:replay.revision,action:'defer',newObservation:true});
  assert.equal(deferred.observationId,replay.observationId);
  assert.deepEqual((await admin.query('select payload,payload_hash from public.research_s4_records where id=$1',[replay.observationId])).rows[0],observed);
  console.log(JSON.stringify({status:'passed',candidateId:candidate.id,observationId:replay.observationId,concurrent_successes:1,replay:'duplicate',defer:'original_observation_preserved',outbox:(await admin.query('select count(*) from research_s4_outbox')).rows[0].count}));
}
main().finally(async()=>{await admin.end();await closeS4Pool();});
