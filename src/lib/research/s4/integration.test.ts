import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync,mkdtempSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from './import';
import {revealCards,selectFanout} from './cards';
import {submitDecision,type DecisionInput} from './decisions';
import {transaction,closeS4Pool} from './db';
import {citation,reviewHistory,candidateStatus,listCandidates} from './read';
import {drainOutbox} from './anchor';
import {digest,canonicalize} from '../ingest/pa-v1/json.js';
import {addRecord} from './records';
import {legacySourceVisible} from '../sources';
const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('S4 real PostgreSQL and filesystem integration',()=>{
 let admin:Pool,pack:ReturnType<typeof testPack>,id:string,revealed:any,input:DecisionInput;
 const actor={userId:randomUUID(),kind:'agent' as const},other={userId:randomUUID(),kind:'agent' as const};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  for(const a of [actor,other]){await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);}
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S4SYNTH','Synthetic','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  pack=testPack(actor.userId);await bind(pack);
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});
 async function bind(p:ReturnType<typeof testPack>){await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);}
 async function counts(){return (await admin.query(`select (select count(*) from research_s4_records where user_id=$1) records,(select count(*) from research_s4_outbox where user_id=$1) outbox,(select count(*) from research_audit_log where user_id=$1) audit`,[actor.userId])).rows[0];}
 it('imports, deduplicates retries and prevents cross-user reads/writes',async()=>{
  const first=await importCandidate(actor,JSON.stringify(pack.pack));id=first.id;
  expect(await importCandidate(actor,JSON.stringify(pack.pack))).toEqual({id,duplicate:true});
  await expect(importCandidate(other,JSON.stringify(pack.pack))).rejects.toThrow('scope_denied');
  expect(await listCandidates(other)).toEqual([]);
  await expect(candidateStatus(other,id)).rejects.toThrow('scope_denied');
  await transaction(other,async db=>expect((await db.query('select * from research_source_versions')).rows).toEqual([]));
 });
 it('preserves same-body propagation while rejecting version metadata rewriting',async()=>{
  const next=testPack(actor.userId,{raw:pack.raw,sourceId:pack.sourceId,versionId:pack.versionId,scope:pack.scope,config:pack.config,version:pack.version});await bind(next);await importCandidate(actor,JSON.stringify(next.pack));
  expect((await admin.query('select count(*) n from research_source_documents where user_id=$1',[actor.userId])).rows[0].n).toBe('1');
  expect((await admin.query('select count(*) n from research_source_occurrences where user_id=$1',[actor.userId])).rows[0].n).toBe('2');
  const changed=testPack(actor.userId,{raw:pack.raw,sourceId:pack.sourceId,versionId:pack.versionId,scope:pack.scope,config:pack.config,version:{...pack.version,time_unknown_reason:'Different metadata'}});await bind(changed);
  const before=await counts();await expect(importCandidate(actor,JSON.stringify(changed.pack))).rejects.toThrow('source_version_conflict');expect(await counts()).toEqual(before);
 });
 it('writes prior label before exposure and always preserves exploration; no fabricated confidence',async()=>{
  revealed=await revealCards(actor,id,{requestKey:randomUUID(),judgment:'Synthetic test only',alreadySeen:[],independentJudgment:true});
  expect(revealed.cards[0].payload.recall_reason).toBe('exploration');expect(revealed.researchStream).toBe('descriptive');
  const rows=(await admin.query("select kind,recorded_at,payload from research_s4_records where id=any($1::uuid[]) order by recorded_at",[[revealed.labelId,revealed.exposureId]])).rows;
  expect(rows.map(r=>r.kind)).toEqual(['HumanLabel','ExposureEvent']);expect(rows[0].payload.independent).toBe(false);
  expect((await citation(actor,id,revealed.cards[0].id,0)).text).toBe(pack.raw);
  await expect(citation(other,id,revealed.cards[0].id,0)).rejects.toThrow('scope_denied');
  input={requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic SQL acceptance',cardId:revealed.cards[0].id,labelId:revealed.labelId,exposureId:revealed.exposureId,securityTicker:'S4SYNTH',companyEntityId:null,newObservation:true,reviewAt:null};
 });
 it('allows one CAS winner, exact retry, and atomic rollback on conflicting keys',async()=>{
  const inputs=[input,{...input,requestKey:randomUUID()}];const race=await Promise.allSettled(inputs.map(i=>submitDecision(actor,id,i)));
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);input=inputs[race.findIndex(r=>r.status==='fulfilled')];
  const before=await counts();expect((await submitDecision(actor,id,input)).duplicate).toBe(true);expect(await counts()).toEqual(before);
  await expect(submitDecision(actor,id,{...input,reason:'changed'})).rejects.toThrow('idempotency_conflict');expect(await counts()).toEqual(before);
  const obs=(await admin.query("select payload from research_s4_records where user_id=$1 and kind='Observation'",[actor.userId])).rows[0].payload;
  expect(obs.status).toBe('pending_start');expect(obs.thesis_revision_ref).toBeNull();expect(obs.windows.every((w:any)=>w.result===null)).toBe(true);
 });
 it('defer preserves old hash and windows; reject adds separate shadow; all six actions append',async()=>{
  const old=(await admin.query("select id,payload,payload_hash from research_s4_records where user_id=$1 and kind='Observation'",[actor.userId])).rows[0];
  const deferred=await submitDecision(actor,id,{...input,requestKey:randomUUID(),expectedRevision:1,action:'defer',newObservation:true});expect(deferred.observationId).toBe(old.id);
  expect((await admin.query('select id,payload,payload_hash from research_s4_records where id=$1',[old.id])).rows[0]).toEqual(old);
  let revision=2;for(const action of ['research','adopt','refute','reject'] as const){await submitDecision(actor,id,{...input,action,requestKey:randomUUID(),expectedRevision:revision++,newObservation:action==='reject'});}
  const history=await reviewHistory(actor,id);expect(history.records.filter(r=>r.kind==='Decision')).toHaveLength(6);
  expect(history.records.some(r=>r.payload.observation_kind==='shadow')).toBe(true);
  const again=await revealCards(actor,id,{requestKey:randomUUID(),judgment:'Already exposed',alreadySeen:[],independentJudgment:true});
  expect(again.contaminationReasons).toContain('shadow_exposed');expect(again.contaminationReasons).toContain('prior_related_exposure');
 });
 it('later source versions never mutate frozen inputs',async()=>{
  const before=(await admin.query("select id,payload_hash from research_s4_records where user_id=$1 and kind='InputSnapshot' order by id",[actor.userId])).rows;
  const newer=testPack(actor.userId,{sourceId:pack.sourceId,scope:pack.scope,config:pack.config});await bind(newer);await importCandidate(actor,JSON.stringify(newer.pack));
  const after=(await admin.query("select id,payload_hash from research_s4_records where id=any($1::uuid[]) order by id",[before.map(r=>r.id)])).rows;expect(after).toEqual(before);
  await expect(admin.query("update research_s4_records set payload='{}' where id=$1",[before[0].id])).rejects.toThrow('immutable_record');
  await expect(transaction(actor,db=>db.query('update research_s4_bindings set revoked=true where user_id=$1',[actor.userId]))).rejects.toThrow('permission denied');
 });
 it('reuses company/thesis tables, freezes a bounded matched fanout and handles Unicode quote edges',async()=>{
  const company=randomUUID();await admin.query("insert into research_entities(id,user_id,type,name) values($1,$2,'COMPANY','Synthetic match')",[company,actor.userId]);
  for(let i=0;i<12;i++)await admin.query("insert into research_theses(user_id,title,body,company_ids) values($1,$2,'Synthetic thesis',$3)",[actor.userId,'Thesis '+i,JSON.stringify([company])]);
  const p=testPack(actor.userId,{raw:'x'.repeat(1199)+'😀END',companyName:'Synthetic match'});await bind(p);const c=await importCandidate(actor,JSON.stringify(p.pack));
  const human={...actor,kind:'human' as const};const r=await revealCards(human,c.id,{requestKey:randomUUID(),judgment:'Human role path with synthetic source',alreadySeen:[],independentJudgment:true});
  expect(r.cards).toHaveLength(10);expect(r.cards.filter((x:any)=>x.payload.thesis_revision_ref)).toHaveLength(9);
  expect((await citation(human,c.id,r.cards[0].id,0)).text).toBe('x'.repeat(1199)+'😀');
  const done=await submitDecision(human,c.id,{...input,requestKey:randomUUID(),expectedRevision:0,cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId});
  const observation=(await admin.query('select payload from research_s4_records where id=$1',[done.observationId])).rows[0].payload;
  expect(observation.actor_kind).toBe('human');expect(observation.research_stream).toBe('descriptive');
  await expect(submitDecision(human,c.id,{...input,newObservation:false,companyEntityId:company,requestKey:randomUUID(),expectedRevision:1,cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId})).rejects.toThrow('observation_scope_conflict');
  await admin.query("insert into stocks_universe(ticker,name,market,exchange,currency) values('S4REALTEST','Not synthetic marker','US','NYSE','USD') on conflict do nothing");
  await expect(submitDecision(human,c.id,{...input,requestKey:randomUUID(),expectedRevision:1,cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId,securityTicker:'S4REALTEST'})).rejects.toThrow('scope_denied');
 });
 it('refuses altered unacknowledged receipt fields after durable write / SQL rollback',async()=>{
  const a={userId:randomUUID(),kind:'agent' as const};
  await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);
  const p=testPack(a.userId);await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[a.userId,p.binding.approvedPayloadHash,p.binding]);await importCandidate(a,JSON.stringify(p.pack));
  const root=mkdtempSync(join(tmpdir(),'s4-forge-test-'));
  await admin.query(`create function s4_test_ack_abort() returns trigger language plpgsql as $$ begin raise exception 'abort_ack'; end $$;create trigger s4_test_ack_abort before update on research_s4_outbox for each row execute function s4_test_ack_abort()`);
  try{await expect(drainOutbox(a,root)).rejects.toThrow('abort_ack');}finally{await admin.query('drop trigger s4_test_ack_abort on research_s4_outbox;drop function s4_test_ack_abort()');}
  const path=join(root,digest(a.userId),'receipts.jsonl'),entry=JSON.parse(readFileSync(path,'utf8'));
  const {receipt_hash:_hash,...body}=entry;void _hash;body.rule_hash='f'.repeat(64);
  const {writeFileSync}=await import('node:fs');writeFileSync(path,canonicalize({...body,receipt_hash:digest(body)})+'\n');
  await expect(drainOutbox(a,root)).rejects.toThrow('anchor_integrity_failed');
  expect((await admin.query('select receipt_hash from research_s4_outbox where user_id=$1',[a.userId])).rows[0].receipt_hash).toBeNull();
 });
 it('streams across SQL pages and resumes bounded append batches without a lifetime cap',async()=>{
  const a={userId:randomUUID(),kind:'agent' as const};await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);
  const p=testPack(a.userId);await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[a.userId,p.binding.approvedPayloadHash,p.binding]);const candidate=await importCandidate(a,JSON.stringify(p.pack));
  await transaction(a,async db=>{for(let i=0;i<1001;i++)await addRecord(db,a,candidate.id,'ControlEvent',{synthetic:true,index:i});});
  const root=mkdtempSync(join(tmpdir(),'s4-page-test-'));const results=[];let left;
  do{const r=await drainOutbox(a,root);results.push(r);left=r.remaining;}while(left);
  expect(results.map(r=>r.appended)).toEqual([500,500,2]);expect((await drainOutbox(a,root)).acknowledged).toBe(0);
 },30000);
 it('concurrent journal workers export once; malformed journal marks integrity failed with audit',async()=>{
  const root=mkdtempSync(join(tmpdir(),'s4-test-journal-'));
  const results=await Promise.all([drainOutbox(actor,root),drainOutbox(actor,root)]);expect(results.filter(r=>r.appended>0)).toHaveLength(1);
  expect((await candidateStatus(actor,id)).observations.every(r=>r.anchor_status==='anchored')).toBe(true);
  const path=join(root,digest(actor.userId),'receipts.jsonl');const lines=readFileSync(path,'utf8').trim().split('\n');expect(lines.every(l=>!l.includes(pack.raw))).toBe(true);
  appendFileSync(path,'{broken}\n');await expect(drainOutbox(actor,root)).rejects.toThrow('anchor_integrity_failed');
  expect((await candidateStatus(actor,id)).observations.every(r=>r.anchor_status==='integrity_failed')).toBe(true);
  expect((await admin.query("select count(*) n from research_s4_records where user_id=$1 and kind='ControlEvent'",[actor.userId])).rows[0].n).toBe('3');
  await expect(submitDecision(actor,id,{...input,requestKey:randomUUID(),expectedRevision:6})).rejects.toThrow('anchor_integrity_failed');
 });
 it('revocation removes cards, history, citations and controlled raw while legacy filters reject copies',async()=>{
  expect(legacySourceVisible({metadata:{s4_controlled_copy:true}})).toBe(false);expect(legacySourceVisible({metadata:{}})).toBe(true);
  await admin.query('update research_s4_bindings set revoked=true where user_id=$1',[actor.userId]);
  await expect(reviewHistory(actor,id)).rejects.toThrow('scope_denied');await expect(citation(actor,id,revealed.cards[0].id,0)).rejects.toThrow('scope_denied');
  await expect(submitDecision(actor,id,input)).rejects.toThrow('anchor_integrity_failed');expect(await listCandidates(actor)).toEqual([]);
  await transaction(actor,async db=>expect((await db.query('select raw_text from research_source_documents where user_id=$1',[actor.userId])).rows).toEqual([]));
 });
});
describe('bounded deterministic baseline',()=>{
 it('keeps exploration, at most eight matches and seeded omitted review independently of Jev',()=>{
  const theses=Array.from({length:100},(_,i)=>({id:String(i),title:'T',company_ids:i<50?['company']:[]}));
  const a=selectFanout(theses,['company'],'seed');expect(a.selected).toHaveLength(10);expect(a.selected.some(t=>t.thesis===null)).toBe(true);
  expect(selectFanout(theses.map(t=>({...t,jev_score:Math.random()})),['company'],'seed').selected.map(t=>t.thesis?.id)).toEqual(a.selected.map(t=>t.thesis?.id));
 });
});
