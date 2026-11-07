// In-memory service wiring and synthetic seeds for broker research tests (plan Part C; spec §12.1).
import {createHash} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {memoryBrokerResearchDb} from './memory-db';
import {brokerPaths,memoryBrokerStorage} from './storage';
import type {MemoryBrokerStorage} from './storage';
import type {CoreDeps} from './deps';
import type {BrokerResearchDb,DocumentRow,LicenceInput,LicenceRow} from './types';
export const ADMIN_ID='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const OTHER_ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6e';
export const T0=new Date('2026-11-06T09:00:00.000Z');
export const seqIds=(stem='00000000-0000-4000-8000-')=>{let n=0;return ()=>`${stem}${(++n).toString(16).padStart(12,'0')}`;};
export const sha256=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export const syntheticPdf=(tag='synthetic')=>new TextEncoder().encode(`%PDF-1.7\n% ${tag}\n%%EOF\n`);
export interface MemoryCore extends CoreDeps{storage:MemoryBrokerStorage;clock:{t:number};advance(ms:number):void}
export function memoryCoreDeps(o:{tables?:TableClient;db?:BrokerResearchDb}={}):MemoryCore{
 const tables=o.tables??memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});
 const clock={t:T0.getTime()},now=()=>new Date(clock.t);
 return {db:o.db??memoryBrokerResearchDb({tables,now}),storage:memoryBrokerStorage(),tables,now,codeVersion:'test-code',newId:seqIds(),clock,advance:(ms)=>{clock.t+=ms;}};
}
export const LICENCE_INPUT:LicenceInput={source_label:'Synthetic terminal',licence_kind:'terminal_subscription',holder:'Owner',terms_summary:'Synthetic test terms',evidence_path:null,
 allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:300,valid_from:'2026-01-01',valid_to:null};
export async function seedLicence(db:BrokerResearchDb,o:{patch?:Partial<LicenceInput>;confirm?:boolean}={}):Promise<LicenceRow>{
 const row=await db.insertLicence({...LICENCE_INPUT,...o.patch});
 if(o.confirm!==false&&await db.confirmLicence(row.licence_id,ADMIN_ID,row.version)!=='confirmed')throw new Error('seed: licence not confirmed');
 return (await db.getLicence(row.licence_id))!;
}
export async function seedDocument(d:MemoryCore,licenceId:string,bytes=syntheticPdf()):Promise<DocumentRow>{
 const sha=sha256(bytes),documentId=d.newId();
 if(await d.db.insertDocument({document_id:documentId,sha256:sha,storage_path:brokerPaths.report(sha),byte_size:bytes.byteLength,licence_id:licenceId,uploaded_by:ADMIN_ID,original_filename:'synthetic.pdf'})!=='inserted')throw new Error('seed: duplicate');
 await d.storage.upload(brokerPaths.report(sha),bytes,'application/pdf');await d.db.updateDocument(documentId,{promotion_pending:false});
 return (await d.db.getDocument(documentId))!;
}
