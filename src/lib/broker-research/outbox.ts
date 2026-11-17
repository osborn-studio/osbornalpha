// src/lib/broker-research/outbox.ts
// Outbox delivery to F4 (spec §8.3, §10.2). SQL writes the events (publish / unpublish / withdraw /
// hide triggers); TS only delivers. With F4 disabled nothing is read or changed: events stay pending
// and their attempts are not incremented. Each event's shape is checked before delivery;
// markOutbox (A4) increments attempts and turns ≥ 10 failures into 'failed'.
import {CLAIM_METHODOLOGY_VERSION} from './versions';
import type {F4Port} from './ports/f4';
import type {BrokerResearchDb,OutboxEvent} from './types';

export const OUTBOX_LIMIT=50,OUTBOX_BUDGET_MS=50_000;
const CLAIM_KEY=/^broker_target_price:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):.+$/i;
/** null when deliverable, else the first offending payload field. */
export function validateOutboxEvent(e:OutboxEvent):string|null{
 if(e.kind!=='claim.register'&&e.kind!=='claim.retract')return null;
 const p=e.payload,m=typeof p.claim_key==='string'?CLAIM_KEY.exec(p.claim_key):null;
 if(!m)return 'claim_key';
 if(p.claim_seq!==(e.kind==='claim.register'?1:2))return 'claim_seq';
 if(e.kind==='claim.retract')return null;
 if(p.claim_type!=='broker_target_price')return 'claim_type';
 if(p.methodology_version!==CLAIM_METHODOLOGY_VERSION)return 'methodology_version';
 const src=p.source as {publication_id?:unknown}|undefined;
 if(!src||typeof src.publication_id!=='string'||src.publication_id.toLowerCase()!==m[1].toLowerCase())return 'source';
 const vis=p.visibility_ref as {view?:unknown}|undefined;
 if(!vis||vis.view!=='broker_report_targets_public_v')return 'visibility_ref';
 return null;
}
export interface OutboxReceipt{skipped:'f4_disabled'|null;taken:number;delivered:number;failed:number}
export async function deliverOutbox(deps:{db:BrokerResearchDb;f4:F4Port;now:()=>Date},opts:{limit:number;deadline:Date}):Promise<OutboxReceipt>{
 if(!deps.f4.enabled)return {skipped:'f4_disabled',taken:0,delivered:0,failed:0};
 const events=await deps.db.takePendingOutbox(Math.min(OUTBOX_LIMIT,opts.limit));
 let delivered=0,failed=0;
 for(const e of events){
  if(deps.now().getTime()>=opts.deadline.getTime())break;
  const bad=validateOutboxEvent(e);
  if(bad){await deps.db.markOutbox(e.event_id,{delivered:false,error:`payload_invalid:${bad}`});failed++;continue;}
  const r=await deps.f4.deliver(e);
  if(r.ok&&r.accepted){await deps.db.markOutbox(e.event_id,{delivered:true});delivered++;}
  else{await deps.db.markOutbox(e.event_id,{delivered:false,error:r.ok?'f4_rejected':r.error});failed++;}
 }
 return {skipped:null,taken:events.length,delivered,failed};
}
