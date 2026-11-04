// Pending issuer_identifier_claims: the review queue for identifiers that contradict stored data.
import {randomUUID} from 'node:crypto';
import {TableError} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import type {ClaimIdType} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string}

/**
 * Files a pending claim unless an identical one is already pending. Retry-safe: the partial
 * unique index (issuer_id,id_type,value) where status='pending' turns a concurrent duplicate
 * into 23505, which is a no-op here. Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const pending={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,status:'pending'};
 if(await client.count('issuer_identifier_claims',pending)>0)return false;
 try{
  await client.insert('issuer_identifier_claims',{id:randomUUID(),...c,confidence:0.5,status:'pending',created_at:new Date().toISOString()});
  return true;
 }catch(e){if(isUnique(e))return false;throw e;}
}
