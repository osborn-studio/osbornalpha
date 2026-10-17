import {verify,type KeyObject} from 'node:crypto';
import Ajv from 'ajv';
import {parseStrict} from '../ingest/pa-v1/json.js';
const uuid={type:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'};
const seq={type:'string',pattern:'^(0|[1-9][0-9]{0,18})$'};
const scope={type:'object',additionalProperties:false,required:['user_id','workspace_id'],properties:{user_id:uuid,workspace_id:{anyOf:[uuid,{type:'null'}]}}};
const timestamp={type:'string',maxLength:24};
const validate=new Ajv({strict:true}).compile({type:'object',additionalProperties:false,
 required:['protocol_version','feed_id','owner_scope','from_seq','through_seq','latest_seq','published_at','events'],properties:{
 protocol_version:{const:'pa-revocation/v1'},feed_id:uuid,owner_scope:scope,from_seq:seq,through_seq:seq,latest_seq:seq,published_at:timestamp,
 events:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,
 required:['revocation_id','monotonic_seq','source_id','grant_id','grant_version','effective_at'],properties:{
 revocation_id:uuid,monotonic_seq:seq,source_id:uuid,grant_id:uuid,grant_version:{type:'integer',minimum:1,maximum:2147483647},effective_at:timestamp}}}}});
export type OwnerScope={user_id:string;workspace_id:string|null};
export interface RevocationEvent {revocation_id:string;monotonic_seq:string;source_id:string;grant_id:string;grant_version:number;effective_at:string}
export interface RevocationPage {protocol_version:'pa-revocation/v1';feed_id:string;owner_scope:OwnerScope;from_seq:string;through_seq:string;latest_seq:string;published_at:string;events:RevocationEvent[]}
export interface FeedCheckpoint {feedId:string;scope:OwnerScope;cursor:string;publishedAt:string|null;latestSeq:string}
const invalid=():never=>{throw new Error('invalid_revocation_page');};
const time=(s:string)=>{const n=Date.parse(s);if(!Number.isFinite(n)||new Date(n).toISOString()!==s)invalid();return n;};
const sequence=(s:string)=>{if(typeof s!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(s))invalid();const n=BigInt(s);if(n>9223372036854775807n)invalid();return n;};
/** Pure contract validation, NOT a persisted inbox or a network transport. Key and checkpoint are trusted local configuration/state. */
export function verifyRevocationPage(raw:Buffer,signatureHex:string,key:KeyObject,checkpoint:FeedCheckpoint,nowMs:number) {
 try {
  if(raw.length>65536||!Number.isSafeInteger(nowMs)||nowMs<0||key.type!=='public'||key.asymmetricKeyType!=='ed25519'||! /^[0-9a-f]{128}$/.test(signatureHex))invalid();
  // Signature covers exact transport bytes, including protocol and owner scope.
  if(!verify(null,raw,key,Buffer.from(signatureHex,'hex')))invalid();
  const value=parseStrict(raw);if(!validate(value))invalid();const page=value as RevocationPage;
  if(page.feed_id!==checkpoint.feedId||page.owner_scope.user_id!==checkpoint.scope.user_id||page.owner_scope.workspace_id!==checkpoint.scope.workspace_id)invalid();
  const cursor=sequence(checkpoint.cursor),previousLatest=sequence(checkpoint.latestSeq);
  const from=sequence(page.from_seq),through=sequence(page.through_seq),latest=sequence(page.latest_seq);
  if(previousLatest<cursor||from!==cursor||through<from||latest<through||latest<previousLatest||through-from!==BigInt(page.events.length))invalid();
  // An empty page cannot conceal a known backlog.
  if(page.events.length===0&&through!==latest)invalid();
  const published=time(page.published_at);
  if(published>nowMs+5000||nowMs-published>60000||(checkpoint.publishedAt!==null&&published<time(checkpoint.publishedAt)))invalid();
  const ids=new Set<string>();
  for(let i=0;i<page.events.length;i++){
   const event=page.events[i];
   if(sequence(event.monotonic_seq)!==from+BigInt(i)+1n||ids.has(event.revocation_id)||time(event.effective_at)>published)invalid();
   ids.add(event.revocation_id);
  }
  return {events:page.events,checkpoint:{...checkpoint,cursor:page.through_seq,latestSeq:page.latest_seq,publishedAt:page.published_at},caughtUp:through===latest};
 }catch{return invalid();}
}
