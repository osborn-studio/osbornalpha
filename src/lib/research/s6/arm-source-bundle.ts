import {digest,fail} from '../ingest/pa-v1/json.js';
import {isUuid} from '../s4/ledger';
import {exactPlanObject as object} from './arm-plan-object';
export const ARM_SOURCE_BUNDLE_PROTOCOL='alpha-arm-source-bundle/1.0';
interface GrantShape {readonly grant_id:string;readonly grant_version:number;readonly grant_hash:string;readonly mapping_hash:string}
export interface ArmCaptureGrant extends GrantShape {readonly purpose:'alpha_arm_capture';readonly recipient:'alpha-local'}
export interface ArmDisclosureGrant extends GrantShape {readonly purpose:'alpha_arm_disclosure';readonly recipient:'alpha-local'}
export interface ArmProcessingGrant extends GrantShape {readonly purpose:'external_model_processing';readonly recipient:string}
interface CommonBundle {
 readonly protocol:typeof ARM_SOURCE_BUNDLE_PROTOCOL;
 readonly source_reference:Readonly<{feed_id:string;source_id:string;source_version_hash:string}>;
}
export type ArmSourceBundle=CommonBundle & (
 {readonly generation_mode:'local';readonly processor:null;readonly purpose_map:Readonly<{capture:ArmCaptureGrant;disclosure:ArmDisclosureGrant;processing:null}>} |
 {readonly generation_mode:'external';readonly processor:string;readonly purpose_map:Readonly<{capture:ArmCaptureGrant;disclosure:ArmDisclosureGrant;processing:ArmProcessingGrant}>}
);
function hash(v:unknown){return typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);}
function grant(v:unknown,purpose:string,recipient:string):Readonly<GrantShape & {purpose:string;recipient:string}>{
 const r=object(v,['grant_id','grant_version','grant_hash','mapping_hash','purpose','recipient']);
 if(!isUuid(r.grant_id)||!Number.isSafeInteger(r.grant_version)||(r.grant_version as number)<1||(r.grant_version as number)>2147483647||!hash(r.grant_hash)||!hash(r.mapping_hash)||r.purpose!==purpose||r.recipient!==recipient)fail('invalid_schema');
 return Object.freeze(r) as unknown as Readonly<GrantShape & {purpose:string;recipient:string}>;
}
/** Inactive closed wire STRUCTURE only. No grant approval, allowlist, source ownership,
 * rights, current mapping, revocation or processor authority is established here.
 * New capture/disclosure purposes cannot be inferred from existing PA-v1 import grants.
 * Trusted versioned producer approvals/authorizer and owner-locked guard integration
 * must exist before any use. Parsing never authorizes external model processing. */
export function parseArmSourceBundle(value:unknown):Readonly<ArmSourceBundle>{
 const r=object(value,['protocol','source_reference','generation_mode','processor','purpose_map']);
 if(r.protocol!==ARM_SOURCE_BUNDLE_PROTOCOL||!['local','external'].includes(r.generation_mode as string))fail('invalid_schema');
 const source=object(r.source_reference,['feed_id','source_id','source_version_hash']);
 if(!isUuid(source.feed_id)||!isUuid(source.source_id)||!hash(source.source_version_hash))fail('invalid_schema');
 const map=object(r.purpose_map,['capture','disclosure','processing']);
 const capture=grant(map.capture,'alpha_arm_capture','alpha-local'),disclosure=grant(map.disclosure,'alpha_arm_disclosure','alpha-local');
 let processing:ReturnType<typeof grant>|null=null;
 if(r.generation_mode==='local'){
  if(r.processor!==null||map.processing!==null)fail('invalid_schema');
 }else{
  // Bounded opaque processor identifier, not an endpoint to call or an allowlist.
  if(typeof r.processor!=='string'||!/^[a-z0-9][a-z0-9._:/-]{0,127}$/.test(r.processor)||r.processor==='alpha-local')fail('invalid_schema');
  processing=grant(map.processing,'external_model_processing',r.processor as string);
 }
 const grants=[capture,disclosure,...(processing?[processing]:[])];
 if(new Set(grants.map(g=>g.grant_id)).size!==grants.length||new Set(grants.map(g=>g.grant_hash)).size!==grants.length)fail('invalid_schema');
 return Object.freeze({...r,source_reference:Object.freeze(source),purpose_map:Object.freeze({capture,disclosure,processing})}) as unknown as Readonly<ArmSourceBundle>;
}
/** One frozen bundle integrity digest; not a consent signature or current use receipt. */
export function armSourceBundleHash(value:unknown){return digest(parseArmSourceBundle(value));}
