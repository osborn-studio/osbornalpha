import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync,mkdtempSync,appendFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {open,type FileHandle} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {testPack} from '../../../../scripts/s4/test-pack';
import {ownedPool,startLocalDatabase,stopLocalDatabase} from '../../../../scripts/s4/local-db';
import {importCandidate} from './import';
import {transaction,closeS4Pool,type S4Actor} from './db';
import {candidateStatus} from './read';
import {addRecord} from './records';
import {drainOutbox} from './anchor';
import {drainOutboxTwoPhase,verifyAnchorChain,type TwoPhaseOptions} from './anchor-two-phase';
import {ZERO_HASH,fileAnchorStore} from './anchor-store';
import type {RunnerManifest} from './anchor-manifest';
import {digest,canonicalize} from '../ingest/pa-v1/json.js';

const enabled=!!process.env.S4_TEST_STATE;
/** This suite owns a disposable cluster of its own. It installs BEFORE UPDATE triggers on the
 * outbox and seeds 200 000 synthetic rows; on the harness database shared by the parallel
 * `test:db` workers either would change other suites' timing and query plans. */
describe.skipIf(!enabled)('S4 two-phase anchor drain (local only)',()=>{
 let admin:Pool,cluster:Awaited<ReturnType<typeof startLocalDatabase>>|undefined;
 beforeAll(async()=>{
  delete process.env.S4_TEST_STATE;delete process.env.ALPHA_S4_DATABASE_URL;
  cluster=await startLocalDatabase();
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=cluster.runtimeUrl;
  admin=ownedPool({connectionString:cluster.adminUrl});
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S4SYNTH','Synthetic','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
 },180000);
 afterAll(async()=>{await closeS4Pool();await admin?.end();if(cluster)stopLocalDatabase(cluster);});

 async function owner(){
  const a:S4Actor={userId:randomUUID(),kind:'agent'};
  await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);
  const p=testPack(a.userId);await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[a.userId,p.binding.approvedPayloadHash,p.binding]);
  const candidate=await importCandidate(a,JSON.stringify(p.pack));
  return {actor:a,candidateId:candidate.id,pack:p};
 }
 function manifestFor(a:S4Actor,generation=1):RunnerManifest{
  return {store_id:randomUUID(),database_identity:randomUUID(),deployment_generation:generation,authorized_owner_scope:[digest(a.userId)],format_version:1};
 }
 function setup(a:S4Actor,extra:Partial<TwoPhaseOptions>={}):TwoPhaseOptions{
  return {root:mkdtempSync(join(tmpdir(),'s4-two-phase-')),manifest:manifestFor(a),...extra};
 }
 const journalOf=(o:TwoPhaseOptions,a:S4Actor)=>join(o.root,digest(a.userId),'receipts.jsonl');
 async function outbox(a:S4Actor){return (await admin.query('select sequence,anchored_at,receipt_hash from research_s4_outbox where user_id=$1 order by sequence',[a.userId])).rows;}
 async function controlEvents(a:S4Actor,candidateId:string,n:number){await transaction(a,async db=>{for(let i=0;i<n;i++)await addRecord(db,a,candidateId,'ControlEvent',{synthetic:true,index:i});});}
 async function withAbortedAck<T>(work:()=>Promise<T>){
  await admin.query(`create function s4_two_phase_abort() returns trigger language plpgsql as $$ begin raise exception 'abort_ack'; end $$;create trigger s4_two_phase_abort before update on research_s4_outbox for each row execute function s4_two_phase_abort()`);
  try{return await work();}finally{await admin.query('drop trigger s4_two_phase_abort on research_s4_outbox;drop function s4_two_phase_abort()');}
 }

 it('V09: a crash between append and ACK is re-read and acknowledged exactly once on the next run',async()=>{
  const {actor}=await owner();const o=setup(actor);
  await withAbortedAck(()=>expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('abort_ack'));
  const lines=readFileSync(journalOf(o,actor),'utf8').trim().split('\n');expect(lines.length).toBeGreaterThan(0);
  expect((await outbox(actor)).every(r=>r.anchored_at===null&&r.receipt_hash===null)).toBe(true);
  const resumed=await drainOutboxTwoPhase(actor,o);
  expect(resumed).toEqual(expect.objectContaining({status:'drained',appended:0,acknowledged:lines.length,remaining:0,provenance_level:'local_receipt'}));
  expect(resumed.last_hash).toBe(JSON.parse(lines.at(-1)!).receipt_hash);
  const before=readFileSync(journalOf(o,actor));
  expect(await drainOutboxTwoPhase(actor,o)).toEqual(expect.objectContaining({appended:0,acknowledged:0,remaining:0}));
  expect(readFileSync(journalOf(o,actor))).toEqual(before);
  expect((await outbox(actor)).every(r=>r.anchored_at!==null&&r.receipt_hash!==null)).toBe(true);
  expect((await candidateStatus(actor,(await admin.query('select id from research_s4_candidates where user_id=$1',[actor.userId])).rows[0].id)).observations).toEqual([]);
 });

 it('writes journals the single-transaction oracle accepts, and accepts journals the oracle wrote',async()=>{
  const {actor,candidateId}=await owner();const o=setup(actor);
  const first=await drainOutboxTwoPhase(actor,o);expect(first.appended).toBeGreaterThan(0);
  const before=readFileSync(journalOf(o,actor));
  expect(await drainOutbox(actor,o.root)).toEqual(expect.objectContaining({appended:0,acknowledged:0,remaining:0,last_hash:first.last_hash}));
  expect(readFileSync(journalOf(o,actor))).toEqual(before);
  await controlEvents(actor,candidateId,3);
  const oracle=await drainOutbox(actor,o.root);expect(oracle.appended).toBe(3);
  expect(await drainOutboxTwoPhase(actor,o)).toEqual(expect.objectContaining({appended:0,acknowledged:0,remaining:0,last_hash:oracle.last_hash}));
  await controlEvents(actor,candidateId,2);
  const again=await drainOutboxTwoPhase(actor,o);expect(again.appended).toBe(2);
  expect(await drainOutbox(actor,o.root)).toEqual(expect.objectContaining({appended:0,acknowledged:0,last_hash:again.last_hash}));
 });

 it('caps a batch at 500 rows and at the byte budget, reporting lock hold per batch',async()=>{
  const {actor,candidateId}=await owner();const o=setup(actor);
  await drainOutboxTwoPhase(actor,o);await controlEvents(actor,candidateId,1001);
  const results=[];let left;do{const r=await drainOutboxTwoPhase(actor,o);results.push(r);left=r.remaining;}while(left);
  expect(results.map(r=>r.appended)).toEqual([500,500,1]);
  for(const r of results){expect(r.lock_hold_ms).toBeGreaterThanOrEqual(0);expect(r.phase_a_ms).toBeGreaterThanOrEqual(0);}
  const {actor:b,candidateId:bc}=await owner();const ob=setup(b,{batch:{bytes:1200}});
  await drainOutboxTwoPhase(b,ob);await controlEvents(b,bc,5);
  const sizes=[];do{const r=await drainOutboxTwoPhase(b,ob);sizes.push(r.appended);left=r.remaining;}while(left);
  expect(sizes.every(n=>n>=1&&n<=2)).toBe(true);expect(sizes.reduce((x,y)=>x+y,0)).toBe(5);
  await expect(drainOutboxTwoPhase(b,setup(b,{batch:{rows:501}}))).rejects.toThrow('invalid_schema');
  await expect(drainOutboxTwoPhase(b,setup(b,{batch:{bytes:1024*1024+1}}))).rejects.toThrow('invalid_schema');
 },60000);

 it('V09: a stalled fsync trips the watchdog, releases the owner session, returns paused and refuses a second writer',async()=>{
  const {actor}=await owner();let stalls=0;const handles:FileHandle[]=[];
  const openFile=async(path:string,flags:number,mode:number):Promise<FileHandle>=>{
    const real=await open(path,flags,mode);if(!path.endsWith('receipts.jsonl'))return real;handles.push(real);
    return new Proxy(real,{get(target,key){if(key==='sync')return()=>{stalls++;return new Promise<void>(()=>{});};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}}) as FileHandle;
  };
  const o=setup(actor,{openFile,watchdogMs:300});
  const paused=await drainOutboxTwoPhase(actor,o);
  expect(paused).toEqual(expect.objectContaining({status:'paused',reason:'flush_timeout',appended:0,acknowledged:0}));
  expect(stalls).toBe(1);
  expect((await outbox(actor)).every(r=>r.anchored_at===null)).toBe(true);
  await transaction(actor,async()=>{});
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_paused');
  await expect(drainOutboxTwoPhase(actor,{...o,openFile:undefined})).rejects.toThrow('anchor_paused');
  expect(stalls).toBe(1);
  expect((await outbox(actor)).every(r=>r.anchored_at===null)).toBe(true);
  for(const h of handles)await h.close().catch(()=>{});
 });

 it('V09: an ACK that outlives the watchdog closes the session and pauses without a second append',async()=>{
  const {actor}=await owner();const o=setup(actor,{watchdogMs:300});
  await admin.query(`create function s4_two_phase_slow() returns trigger language plpgsql as $$ begin perform pg_sleep(1.5); return new; end $$;create trigger s4_two_phase_slow before update on research_s4_outbox for each row execute function s4_two_phase_slow()`);
  try{
   const paused=await drainOutboxTwoPhase(actor,o);
   expect(paused).toEqual(expect.objectContaining({status:'paused',reason:'ack_timeout',appended:0,acknowledged:0}));
  }finally{await admin.query('drop trigger s4_two_phase_slow on research_s4_outbox;drop function s4_two_phase_slow()');}
  await transaction(actor,async()=>{});
  expect((await outbox(actor)).every(r=>r.anchored_at===null)).toBe(true);
  const journal=readFileSync(journalOf(o,actor),'utf8');expect(journal.trim().split('\n').length).toBeGreaterThan(0);
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_paused');
  expect(readFileSync(journalOf(o,actor),'utf8')).toBe(journal);
 },20000);

 it('refuses to append or ACK when the fence reports a generation above the manifest',async()=>{
  const {actor}=await owner();
  const o=setup(actor,{fence:{generation:async()=>2}});
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('generation_fenced');
  expect(existsSync(journalOf(o,actor))?readFileSync(journalOf(o,actor),'utf8'):'').toBe('');
  expect((await outbox(actor)).every(r=>r.anchored_at===null)).toBe(true);
  let calls=0;const moving=setup(actor,{fence:{generation:async()=>++calls>=2?2:1}});
  await expect(drainOutboxTwoPhase(actor,moving)).rejects.toThrow('generation_fenced');
  expect((await outbox(actor)).every(r=>r.anchored_at===null)).toBe(true);
  expect(await drainOutboxTwoPhase(actor,setup(actor,{fence:{generation:async()=>1}}))).toEqual(expect.objectContaining({status:'drained'}));
 });

 it('refuses an owner outside the manifest scope and a manifest from anything but the parsed type',async()=>{
  const {actor}=await owner();const {actor:stranger}=await owner();
  await expect(drainOutboxTwoPhase(stranger,setup(actor))).rejects.toThrow('scope_denied');
  expect((await outbox(stranger)).every(r=>r.anchored_at===null)).toBe(true);
  await expect(drainOutboxTwoPhase(actor,{...setup(actor),manifest:{...manifestFor(actor),format_version:2} as unknown as RunnerManifest})).rejects.toThrow('invalid_schema');
 });

 it('V10: a partial last line quarantines the owner exactly like the oracle',async()=>{
  const {actor}=await owner();const o=setup(actor);await drainOutboxTwoPhase(actor,o);
  appendFileSync(journalOf(o,actor),'{"sequence":"9"');
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_integrity_failed');
  expect((await admin.query('select reason from research_s4_integrity where user_id=$1',[actor.userId])).rows).toEqual([{reason:'anchor_integrity_failed'}]);
  await expect(drainOutbox(actor,o.root)).rejects.toThrow('anchor_integrity_failed');
 });

 it('V10: a damaged hash quarantines the owner and never acknowledges',async()=>{
  const {actor}=await owner();const o=setup(actor);
  await withAbortedAck(()=>expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('abort_ack'));
  const path=journalOf(o,actor);const lines=readFileSync(path,'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const {receipt_hash:_hash,...body}=lines[0];void _hash;body.rule_hash='f'.repeat(64);
  writeFileSync(path,[canonicalize({...body,receipt_hash:digest(body)}),...lines.slice(1).map(l=>canonicalize(l))].join('\n')+'\n');
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_integrity_failed');
  expect((await outbox(actor)).every(r=>r.receipt_hash===null)).toBe(true);
  expect((await admin.query('select count(*) n from research_s4_integrity where user_id=$1',[actor.userId])).rows[0].n).toBe('1');
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_integrity_failed');
 });

 it('V10: an observation chain with a damaged journal marks every observation integrity_failed with a ControlEvent',async()=>{
  const {actor,candidateId}=await owner();const o=setup(actor);
  const {revealCards}=await import('./cards');const {submitDecision}=await import('./decisions');
  const revealed=await revealCards(actor,candidateId,{requestKey:randomUUID(),judgment:'Synthetic two-phase',alreadySeen:[],independentJudgment:true});
  await submitDecision(actor,candidateId,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic two-phase acceptance',cardId:revealed.cards[0].id,labelId:revealed.labelId,exposureId:revealed.exposureId,securityTicker:'S4SYNTH',companyEntityId:null,newObservation:true,reviewAt:null});
  const drained=await drainOutboxTwoPhase(actor,o);expect(drained.appended).toBeGreaterThan(0);
  const status=await candidateStatus(actor,candidateId);expect(status.observations.length).toBeGreaterThan(0);
  expect(status.observations.every(r=>r.anchor_status==='anchored')).toBe(true);
  expect((await admin.query("select count(*) n from research_s4_records where user_id=$1 and kind='AnchorReceipt'",[actor.userId])).rows[0].n).toBe(String(status.observations.length));
  appendFileSync(journalOf(o,actor),'{broken}\n');
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_integrity_failed');
  expect((await candidateStatus(actor,candidateId)).observations.every(r=>r.anchor_status==='integrity_failed')).toBe(true);
  expect((await admin.query("select count(*) n from research_s4_records where user_id=$1 and kind='ControlEvent'",[actor.userId])).rows[0].n).toBe(String(status.observations.length));
 });

 it('V10: two concurrent two-phase drains export once, and a two-phase drain racing the oracle exports once',async()=>{
  const {actor,candidateId}=await owner();const o=setup(actor);
  const pair=await Promise.all([drainOutboxTwoPhase(actor,o),drainOutboxTwoPhase(actor,o)]);
  expect(pair.filter(r=>r.appended>0)).toHaveLength(1);expect(pair.every(r=>r.status==='drained')).toBe(true);
  await controlEvents(actor,candidateId,4);
  const mixed=await Promise.all([drainOutboxTwoPhase(actor,o),drainOutbox(actor,o.root)]);
  expect(mixed.map(r=>r.appended).sort()).toEqual([0,4]);
  const lines=readFileSync(journalOf(o,actor),'utf8').trim().split('\n');
  expect(new Set(lines.map(l=>JSON.parse(l).sequence)).size).toBe(lines.length);
 });

 it('V10: a stable journal with a future export time still quarantines without ACK',async()=>{
  const {actor}=await owner();const o=setup(actor);
  await withAbortedAck(()=>expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('abort_ack'));
  const path=journalOf(o,actor),lines=readFileSync(path,'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const {receipt_hash:_hash,...body}=lines.at(-1)!;void _hash;
  body.exported_at=(await admin.query("select clock_timestamp()+interval '1 day' as future")).rows[0].future.toISOString();
  lines[lines.length-1]={...body,receipt_hash:digest(body)};
  writeFileSync(path,lines.map(l=>canonicalize(l)).join('\n')+'\n');
  const before=readFileSync(path);
  await expect(drainOutboxTwoPhase(actor,o)).rejects.toThrow('anchor_integrity_failed');
  expect((await admin.query('select reason from research_s4_integrity where user_id=$1',[actor.userId])).rows).toEqual([{reason:'anchor_integrity_failed'}]);
  expect((await outbox(actor)).every(r=>r.anchored_at===null&&r.receipt_hash===null)).toBe(true);
  expect(readFileSync(path)).toEqual(before);
 });

 it('V10: retries when the oracle appends after Phase A samples its database time',async()=>{
  const {actor,candidateId}=await owner();const o=setup(actor);
  await drainOutboxTwoPhase(actor,o);await controlEvents(actor,candidateId,4);
  let opens=0,oracle:Awaited<ReturnType<typeof drainOutbox>>|undefined;
  const openFile:NonNullable<TwoPhaseOptions['openFile']>=async(path,flags,mode)=>{
   // The first open samples the checkpoint; the second starts the receipt scan,
   // after the repeatable-read snapshot and server time have been sampled.
   if(path.endsWith('receipts.jsonl')&&++opens===2){
    await admin.query('select pg_sleep(0.02)');
    oracle=await drainOutbox(actor,o.root);
   }
   return open(path,flags,mode);
  };
  const drained=await drainOutboxTwoPhase(actor,{...o,openFile});
  expect(oracle?.appended).toBe(4);
  expect(drained).toEqual(expect.objectContaining({status:'drained',appended:0,acknowledged:0,remaining:0,attempts:2,last_hash:oracle?.last_hash}));
  expect((await admin.query('select reason from research_s4_integrity where user_id=$1',[actor.userId])).rows).toEqual([]);
  const lines=readFileSync(journalOf(o,actor),'utf8').trim().split('\n');
  expect(new Set(lines.map(l=>JSON.parse(l).sequence)).size).toBe(lines.length);
  expect((await outbox(actor)).every(r=>r.anchored_at!==null&&r.receipt_hash!==null)).toBe(true);
 });

 /** Bulk-inserts `total` synthetic ControlEvent rows (records + outbox) for one owner without the per-row runtime path. */
 async function seedTier(a:S4Actor,candidateId:string,total:number){
  const serverTime='2026-10-01T00:00:00.000Z',chunk=20000;
  for(let start=0;start<total;start+=chunk){
   const n=Math.min(chunk,total-start),rid:string[]=[],payloads:string[]=[],ph:string[]=[],events:string[]=[],eh:string[]=[];
   for(let i=0;i<n;i++){const id=randomUUID(),payload={synthetic:true,index:start+i},hash=digest(payload);
    const event={record_id:id,kind:'ControlEvent',payload_hash:hash,server_time:serverTime,observation_hash:null,rule_hash:null,provenance_level:'local_receipt'};
    rid.push(id);payloads.push(canonicalize(payload));ph.push(hash);events.push(canonicalize(event));eh.push(digest(event));}
   await admin.query(`insert into research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash,recorded_at) select $1,u.id,$2,'ControlEvent',u.payload::jsonb,u.hash,$3 from unnest($4::uuid[],$5::text[],$6::text[]) with ordinality as u(id,payload,hash,ord) order by u.ord`,[a.userId,candidateId,serverTime,rid,payloads,ph]);
   await admin.query(`insert into research_s4_outbox(user_id,candidate_id,record_id,event,event_hash) select $1,$2,u.id,u.event::jsonb,u.hash from unnest($3::uuid[],$4::text[],$5::text[]) with ordinality as u(id,event,hash,ord) order by u.ord`,[a.userId,candidateId,rid,events,eh]);
  }
 }
 /** Extends an existing journal with receipts for every unanchored row except the last `pending`, marking those rows anchored in SQL. */
 async function extendJournal(a:S4Actor,source:string,target:string,pending:number){
  const scope=digest(a.userId),exportedAt='2026-10-02T00:00:00.000Z';
  const existing=readFileSync(source,'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const rows=(await admin.query('select sequence,record_id,event_hash,event from research_s4_outbox where user_id=$1 and anchored_at is null order by sequence',[a.userId])).rows;
  let previous=existing.at(-1).receipt_hash;const lines=existing.map(e=>canonicalize(e));const seqs:string[]=[],rh:string[]=[];
  for(const row of rows.slice(0,rows.length-pending)){
   const body={sequence:row.sequence,owner_scope_hash:scope,record_id:row.record_id,event_hash:row.event_hash,record_kind:row.event.kind,observation_hash:null,rule_hash:null,server_time:row.event.server_time,exported_at:exportedAt,previous_hash:previous,provenance_level:'local_receipt'};
   const hash=digest(body);lines.push(canonicalize({...body,receipt_hash:hash}));seqs.push(row.sequence);rh.push(hash);previous=hash;
  }
  for(let start=0;start<seqs.length;start+=20000)
   await admin.query('update research_s4_outbox o set anchored_at=$4::timestamptz,receipt_hash=u.h from unnest($2::bigint[],$3::text[]) u(s,h) where o.user_id=$1 and o.sequence=u.s',[a.userId,seqs.slice(start,start+20000),rh.slice(start,start+20000),exportedAt]);
  mkdirSync(join(target,scope),{mode:0o700});writeFileSync(join(target,scope,'receipts.jsonl'),lines.join('\n')+'\n',{mode:0o600});
  return {entries:lines.length,bytes:statSync(join(target,scope,'receipts.jsonl')).size};
 }
 async function holdingOwnerLock<T>(a:S4Actor,work:()=>Promise<T>):Promise<T>{
  const holder:PoolClient=await admin.connect();
  try{await holder.query('begin');await holder.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',[a.userId]);return await work();}
  finally{await holder.query('rollback');holder.release();}
 }
 for(const [tier,total] of [['20k',20000],['200k',200000]] as const){
  it(`${tier} tier: Phase A scans the journal without the owner lock and Phase B holds it for one bounded batch`,async()=>{
   const {actor,candidateId}=await owner();const o=setup(actor);
   expect((await drainOutboxTwoPhase(actor,o)).remaining).toBe(0);
   await seedTier(actor,candidateId,total);
   const tierOptions={...o,root:mkdtempSync(join(tmpdir(),'s4-tier-root-'))};
   const journal=await extendJournal(actor,journalOf(o,actor),tierOptions.root,500);
   const scanned=await holdingOwnerLock(actor,()=>verifyAnchorChain(actor,tierOptions));
   expect(scanned.entries).toBe(journal.entries);expect(scanned.recovered).toEqual([]);expect(scanned.pending).toBe(500);
   expect(scanned.scan_ms).toBeGreaterThan(0);
   const storeOnly=await fileAnchorStore(tierOptions.root,digest(actor.userId)).verify();expect(storeOnly.entries).toBe(journal.entries);
   const drained=await drainOutboxTwoPhase(actor,tierOptions);
   expect(drained).toEqual(expect.objectContaining({status:'drained',appended:500,acknowledged:500,remaining:0}));
   console.log(JSON.stringify({anchor_capacity:tier,journal_entries:journal.entries,journal_bytes:journal.bytes,store_verify_ms:storeOnly.scan_ms,
    phase_a_ms_under_foreign_lock:scanned.scan_ms,drain_phase_a_ms:drained.phase_a_ms,phase_b_lock_hold_ms:drained.lock_hold_ms,attempts:drained.attempts}));
   expect(await drainOutbox(actor,tierOptions.root)).toEqual(expect.objectContaining({appended:0,acknowledged:0,remaining:0,last_hash:drained.last_hash}));
  },tier==='20k'?180000:900000);
 }
});
