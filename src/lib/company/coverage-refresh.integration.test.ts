import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {factInsert,filingInsert} from '@/lib/facts/db-contract';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {runCompanyDigest,type DigestDeps} from './digest';
import {coverageInput} from './db-contract';
import {toDirectoryRows} from './directory';
import {memorySnapshotObjectStore} from './evidence-index';
import {memoryCompanyDb} from './memory-company-db';
import {memorySnapshotReader} from './snapshot-read';

describe('financial period coverage release refresh',()=>{
 it('keeps legacy coverage until apply, then replaces it through a full digest at the same facts revision',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
  const facts=memoryFactsDb(tables);
  const db=memoryCompanyDb({facts});
  const issuer=randomUUID(),batch=randomUUID();
  await facts.reconcileScope('US',[{issuer_id:issuer,reasons:['test'],priority:1,fetch_key:'fixture'}]);
  expect(await facts.claimLease(issuer,'US',batch,600)).toBe(true);
  const run=await facts.beginRun(issuer,'US',batch,1);
  const filing=filingInsert(issuer,{availableDate:'2026-10-22',periodEnd:'2026-09-30'});
  await facts.stageFilings(run,[filing]);
  await facts.stageFacts(run,[
   factInsert(issuer,filing,{value:'100',period_start:'2026-01-01',period_end:'2026-09-30',duration:'9M'}),
   factInsert(issuer,filing,{concept:'shares_outstanding',source_concept:'dei:EntityCommonStockSharesOutstanding',statement:'DEI',value:'10',period_start:null,period_end:'2027-07-17',duration:'INSTANT',unit:'shares'}),
  ]);
  await facts.publishRun(run,[filing.filing_id]);
  await facts.releaseLease(issuer,'US',batch,'success','2026-11-09T00:00:00Z');
  // An existing deployment has already materialized the cover observation as its latest period.
  const legacyBatch=randomUUID();db.registerBatch(legacyBatch);
  const at=new Date('2026-11-08T12:00:00Z');
  const attempt=await db.beginAttempt(issuer,'US',at);
  await db.replaceDigest(issuer,'US',legacyBatch,attempt,randomUUID(),1,true,[],coverageInput({
   facts_count:2,concepts_covered:2,earliest_period_end:'2026-09-30',latest_period_end:'2027-07-17',latest_available_date:'2026-10-22',
  }));
  const deps:DigestDeps={tables,facts,db:{...db,replaceDigest:(i,m,b,...rest)=>{db.registerBatch(b);return db.replaceDigest(i,m,b,...rest);}},
   readSnapshot:memorySnapshotReader(facts),reader:memorySnapshotObjectStore(new Map()),now:()=>at,deadline:null,codeVersion:'a'.repeat(40)};
  const options={mode:'full' as const,market:'US' as const,issuerIds:[issuer]};
  const before=await db.coverageOf([issuer]);
  const dry=await runCompanyDigest(deps,{...options,dryRun:true});
  expect(dry.status).toBe('dry_run');
  expect(await db.coverageOf([issuer])).toEqual(before);
  expect(before[0].latest_period_end).toBe('2027-07-17');
  const applied=await runCompanyDigest(deps,options);
  expect(applied.status).toBe('success');
  expect(applied.streams[0]).toMatchObject({basedOnRev:1,sweep:true});
  const coverage=await db.coverageOf([issuer]);
  expect(coverage[0]).toMatchObject({based_on_rev:1,earliest_period_end:'2026-09-30',latest_period_end:'2026-09-30',latest_available_date:'2026-10-22',facts_count:2,concepts_covered:2});
  const directory=toDirectoryRows(coverage,{
   issuers:[{issuer_id:issuer,canonical_name_zh:null,canonical_name_en:'Fixture Company'}],
   securities:[{issuer_id:issuer,ticker:'TEST',is_primary:true,valid_from:'2000-01-01',valid_to:null}],
  },'2026-11-08');
  expect(directory[0]).toMatchObject({primaryTicker:'TEST',latestPeriodEnd:'2026-09-30',latestAvailableDate:'2026-10-22',conceptsCovered:2});
  const snapshot=await deps.readSnapshot(issuer,'US',{concepts:null,asOf:'2026-11-08',history:true});
  expect(snapshot.stateRev).toBe(1);
  expect(snapshot.rows.find(r=>r.statement==='DEI')).toMatchObject({period_end:'2027-07-17',value_text:'10'});
 });
});
