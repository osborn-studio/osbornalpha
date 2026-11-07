// Best effort admin decision audit (spec §8.2); a committed decision must not be retried due to audit failure.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function auditAdmin(tables:TableClient,userId:string,action:string,objectId:string|null,detail:Record<string,unknown>={},now=new Date()):Promise<void>{
 try{
  await tables.insert('research_audit_log',{id:randomUUID(),user_id:userId,actor:'user',action,object_type:'broker_research',
   object_id:objectId!==null&&UUID.test(objectId)?objectId:null,detail,created_at:now.toISOString()});
 }catch(e){console.error('[broker-research] audit failed',e instanceof Error?e.message:e);}
}
