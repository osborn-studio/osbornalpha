// src/lib/judgments/testing/db-helpers.ts
// Test helpers (not a test file) around any JudgmentsDb. withSubjects overrides subjectExists (the
// memory db knows no issuers / regions); spyRegister counts successful registerJudgment RPCs (spec §15
// example 1: "行数不变" = no second insert); syncTestMethod syncs a test-only method into a db with
// placeholder hashes (FIXTURE_HASHES) so unit tests never run formula-hash.
import {memoryTableClient} from '@/lib/db/memory-table-client';
import type {JudgmentsDb,Methodology,Subject} from '../types';
import {methodologyRowOf} from '../registry';
import type {MethodologyHashes} from '../registry';

export const FIXTURE_HASHES:MethodologyHashes={doc_sha256:'1'.repeat(64),implementation_sha256:'2'.repeat(64),deps_sha256:'3'.repeat(64),formula_hash:'4'.repeat(64)};
export function withSubjects(db:JudgmentsDb,status:(s:Subject)=>'active'|'inactive'|'missing'=()=>'active'):JudgmentsDb{
 return new Proxy(db,{get:(t,k,r)=>k==='subjectExists'?async(s:Subject)=>status(s):Reflect.get(t,k,r)});
}
export function spyRegister(db:JudgmentsDb):{db:JudgmentsDb;calls:()=>number}{
 let n=0;
 const proxy=new Proxy(db,{get:(t,k,r)=>k==='registerJudgment'?async(...a:Parameters<JudgmentsDb['registerJudgment']>)=>{const out=await t.registerJudgment(...a);n++;return out;}:Reflect.get(t,k,r)});
 return {db:proxy,calls:()=>n};
}
export async function syncTestMethod(db:JudgmentsDb,m:Methodology,o:{publishable?:boolean}={}):Promise<void>{
 await db.syncMethodology(methodologyRowOf(m,FIXTURE_HASHES,{publishable:o.publishable??false,code_version:'test0000'}),'script',null);
}
/** TableClient shared by the memory db and the register / quarantine paths, holding one running ingest batch (the memory db enforces the batch_id FK like the real one). */
export async function batchTables(batchId:string):Promise<ReturnType<typeof memoryTableClient>>{
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],research_audit_log:['id']});
 await tables.insert('ingest_batches',{batch_id:batchId,producer:'ts-judgments',dataset:'judgments.test',status:'running',started_at:new Date().toISOString(),finished_at:null,counts:{},errors:[],tool_versions:{},code_version:'abcdef0',triggered_by:'script'});
 return tables;
}
