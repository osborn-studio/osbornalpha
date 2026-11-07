// Durable bucket-write inventory and lease fences (P-R5-01..03, P-R6-02..04). A timed-out call
// remains pending because a timeout does not prove that the remote writer stopped.
import {conflict,gone} from './errors';
import type {BrokerStorage,ObjectType} from './storage';
import type {BrokerResearchDb,StorageWriter} from './types';

export const UPLOAD_TIMEOUT_MS=120_000;
export interface TrackedWrite{documentId:string;path:string;writer:StorageWriter;body:Uint8Array|string;contentType:ObjectType;lease?:{token:string;ttlSeconds:number}}
type TDeps={db:BrokerResearchDb;storage:BrokerStorage};
async function fence(deps:Pick<TDeps,'db'>,w:Pick<TrackedWrite,'documentId'|'lease'>):Promise<'ok'|'lease_lost'|'document_withdrawn'>{
 const d=await deps.db.getDocument(w.documentId);
 if(!d||d.status==='withdrawn')return 'document_withdrawn';
 return w.lease?deps.db.renewLease(w.documentId,w.lease.token,w.lease.ttlSeconds):'ok';
}
const stop=(r:'lease_lost'|'document_withdrawn')=>r==='document_withdrawn'?gone():conflict('lease_lost');
/** Liveness only: the underlying operation is not cancelled. */
export function withinLiveness<T>(p:Promise<T>,ms:number):Promise<T>{
 let t:ReturnType<typeof setTimeout>|undefined;
 return Promise.race([p,new Promise<never>((_,reject)=>{t=setTimeout(()=>reject(new Error('upload_liveness_timeout')),ms);})]).finally(()=>clearTimeout(t));
}
export async function trackedUpload(deps:TDeps,w:TrackedWrite):Promise<'stored'|'exists'>{
 const writeId=await deps.db.registerWrite({document_id:w.documentId,path:w.path,writer:w.writer});
 const before=await fence(deps,w);
 if(before!=='ok'){await deps.db.abandonWrite(writeId);throw stop(before);}
 const result=await withinLiveness(deps.storage.upload(w.path,w.body,w.contentType),UPLOAD_TIMEOUT_MS);
 const after=await fence(deps,w);
 if(after!=='ok'){
  const current=await deps.db.getDocument(w.documentId);
  if(current?.status!=='withdrawn'||current.purge_requested_at)await deps.storage.remove([w.path]).catch(()=>{});
  await deps.db.finishWrite(writeId);
  throw stop(after);
 }
 await deps.db.finishWrite(writeId);return result;
}
/** F3 calls the callback only after its preflight fence; uncertain remote writes stay pending. */
export async function trackedPortWrite<T>(deps:Pick<TDeps,'db'>,o:{documentId:string;prefix:string;writer:StorageWriter;lease:{token:string;ttlSeconds:number}},invoke:()=>Promise<T>):Promise<T>{
 const writeId=await deps.db.registerWrite({document_id:o.documentId,path:o.prefix,writer:o.writer});
 const before=await fence(deps,o);
 if(before!=='ok'){await deps.db.abandonWrite(writeId);throw stop(before);}
 const result=await invoke();
 const after=await fence(deps,o);
 if(after!=='ok')throw stop(after);
 await deps.db.finishWrite(writeId);return result;
}
/** Per-call cleanup deadline. A timeout never proves a bucket operation was cancelled. */
export async function deleteRegisteredPath(storage:BrokerStorage,path:string,budget?:{until:number;now:()=>Date}):Promise<string[]>{
 const call=<T>(invoke:()=>Promise<T>):Promise<T>=>{
  if(!budget)return invoke();const remaining=budget.until-budget.now().getTime();
  if(remaining<=0)throw new Error('cleanup_deadline');return withinLiveness(invoke(),Math.min(5_000,remaining));
 };
 const objects=path.endsWith('/')?await call(()=>storage.list(path)):(await call(()=>storage.exists(path)))?[path]:[];
 if(objects.length)await call(()=>storage.remove(objects));return objects;
}
