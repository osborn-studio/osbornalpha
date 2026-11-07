// src/lib/macro/quarantine-cli.ts
// Core of scripts/macro/resolve-quarantine.ts (spec §4.3, §0.2 M10; 第 4 稿 P1-4). Lists open macro.* quarantine items
// with their members (macro_quarantine_members: the stored quarantined rows bound to the item). Resolves one through
// MacroDb.resolveConflict (RPC macro_resolve_conflict: one transaction — accept promotes the chosen member and rejects
// the others, reject rejects all — sets dq_quarantine, writes research_audit_log, bumps input_revision on accept). The
// resolver must be an admin profile. Published snapshots are never edited; the next publish reflects the decision.
import {MacroDbError} from './db';
import type {QuarantineMember} from './types';
export type QuarantineCommand={kind:'list';json:boolean}|{kind:'resolve';decision:'accept'|'reject';id:string;by:string;observation:string|null};
export interface OpenItem{id:string;dataset:string;natural_key:string;reason_code:string;detail:Record<string,unknown>;payload:Record<string,unknown>;batch_id:string;created_at:string;members:QuarantineMember[]}
export interface QuarantineDeps{listOpen():Promise<OpenItem[]>;isAdmin(userId:string):Promise<boolean>;resolve(id:string,decision:'accept'|'reject',by:string,observationId?:string):Promise<void>;log(line:string):void}
/** SQL refusals surfaced as exit code 3 (contract codes, or rpc_failed carrying one of these messages). */
const REFUSALS=['already_resolved','not_found','reject_only','not_member','not_quarantined','member_ineligible','observation_required'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** adapter_mismatch and rule_failed:* values were never written (no quarantined observation row exists): the RPC
 *  refuses accept with reject_only; the CLI refuses first. unexpected_revision and stale_delivery are accepted by
 *  choosing a member; conflicting_rows has no stored row (no member), so accept answers not_member. */
export const isRejectOnly=(reasonCode:string):boolean=>reasonCode==='adapter_mismatch'||reasonCode.startsWith('rule_failed:');
export function parseQuarantineArgs(argv:readonly string[]):QuarantineCommand{
 const has=(f:string)=>argv.includes(f);
 const val=(f:string)=>{const i=argv.indexOf(f);return i>=0?argv[i+1]:undefined;};
 if(has('--accept')&&has('--reject'))throw new Error('choose one of --accept / --reject');
 if(!has('--accept')&&!has('--reject')){
  if(has('--by'))throw new Error('--by is only valid with --accept or --reject');
  return {kind:'list',json:has('--json')};
 }
 const decision=has('--accept')?'accept':'reject';
 const id=val(`--${decision}`);
 if(!id||!UUID.test(id))throw new Error('quarantine id must be a uuid');
 const by=val('--by');
 if(!by||!UUID.test(by))throw new Error('--by <admin user uuid> is required');
 const observation=val('--observation')??null;
 if(decision==='reject'&&has('--observation'))throw new Error('--observation is only valid with --accept');
 if(decision==='accept'&&(!observation||!UUID.test(observation)))throw new Error('--accept needs --observation <member observation uuid> (see the listing)');
 return {kind:'resolve',decision,id,by,observation};
}
export function formatOpenItems(items:readonly OpenItem[]):string{
 if(!items.length)return 'no open macro quarantine items';
 return items.map(i=>[[i.id,i.dataset,i.natural_key,isRejectOnly(i.reason_code)?`${i.reason_code} [reject-only]`:i.reason_code,i.created_at,`detail=${JSON.stringify(i.detail).slice(0,160)}`].join('  '),
  ...i.members.map(m=>`    member ${m.observation_id} v${m.version} ${m.value_text} ${m.status}`)].join('\n')).join('\n');
}
export async function runQuarantineCommand(cmd:QuarantineCommand,deps:QuarantineDeps):Promise<number>{
 if(cmd.kind==='list'){const items=await deps.listOpen();deps.log(cmd.json?JSON.stringify(items,null,1):formatOpenItems(items));return 0;}
 if(!await deps.isAdmin(cmd.by)){deps.log(`refused: ${cmd.by} is not an admin profile`);return 2;}
 if(cmd.decision==='accept'){
  const it=(await deps.listOpen()).find(i=>i.id===cmd.id);
  if(it&&isRejectOnly(it.reason_code)){deps.log(`refused: reject_only (${it.reason_code} has no stored quarantined row to accept)`);return 3;}
 }
 try{await deps.resolve(cmd.id,cmd.decision,cmd.by,cmd.observation??undefined);}
 catch(e){
  if(e instanceof MacroDbError){const why=REFUSALS.includes(e.code)?e.code:REFUSALS.includes(e.message)?e.message:null;if(why){deps.log(`refused: ${why}`);return 3;}}
  throw e;
 }
 deps.log(`resolved ${cmd.id}: ${cmd.decision}`);
 return 0;
}
