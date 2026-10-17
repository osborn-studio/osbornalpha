import Ajv from 'ajv';
import {prepareCandidate,type CandidateBinding} from '../ingest/candidate';
import type {OwnerScope} from './feed';
const uuid={type:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'};
const check=new Ajv({strict:true}).compile({type:'object',additionalProperties:false,
 required:['protocol_version','feed_id','owner_scope','source_id','grant_id','grant_version','observed_at','revocation_seq_at_export'],properties:{
 protocol_version:{const:'pa-grant-reference/v1'},feed_id:uuid,source_id:uuid,grant_id:uuid,
 owner_scope:{type:'object',additionalProperties:false,required:['user_id','workspace_id'],properties:{user_id:uuid,workspace_id:{anyOf:[uuid,{type:'null'}]}}},
 grant_version:{type:'integer',minimum:1,maximum:2147483647},observed_at:{type:'string',maxLength:24},
 revocation_seq_at_export:{type:'string',pattern:'^(0|[1-9][0-9]{0,18})$'}}});
export interface GrantReference {
 protocol_version:'pa-grant-reference/v1';feed_id:string;owner_scope:OwnerScope;source_id:string;grant_id:string;
 grant_version:number;observed_at:string;revocation_seq_at_export:string;
}
/** Candidate-only approval validation. Binding and expected feed are trusted operator
 * dependencies, never upload fields. No cursor, mapping or authorization is created. */
export interface ExpectedGrantReference {feedId:string;scope:OwnerScope;sourceId:string;grantId:string;grantVersion:number}
export function prepareRevocationCandidate(raw:string,actor:string,binding:CandidateBinding,expected:ExpectedGrantReference) {
 // Preserve existing approval/schema/limit errors and validate both hashes first.
 const prepared=prepareCandidate(raw,actor,binding);
 try {
  const value=prepared.manifest.extensions?.['pa.revocation_reference'];
  if(!check(value))throw new Error();
  const reference=value as GrantReference;
  if(reference.feed_id!==expected.feedId||reference.owner_scope.user_id!==expected.scope.user_id||reference.owner_scope.workspace_id!==expected.scope.workspace_id
   ||reference.owner_scope.user_id!==prepared.upstreamScope.user_id||reference.owner_scope.workspace_id!==prepared.upstreamScope.workspace_id
   ||reference.source_id!==prepared.sourceRef.source_id||reference.grant_id!==prepared.grant.grant_id
   ||reference.source_id!==expected.sourceId||reference.grant_id!==expected.grantId||reference.grant_version!==expected.grantVersion
   ||reference.grant_id!==(binding.trustedConfig.grant as {grant_id?:unknown}).grant_id)throw new Error();
  const observed=Date.parse(reference.observed_at);
  if(!Number.isFinite(observed)||new Date(observed).toISOString()!==reference.observed_at||observed>Date.parse(prepared.manifest.created_at)
   ||BigInt(reference.revocation_seq_at_export)>9223372036854775807n)throw new Error();
  return {prepared,reference};
 }catch{throw new Error('invalid_revocation_candidate');}
}
