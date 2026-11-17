// Atomic broker quarantine verdict and side effect via DB RPC (spec §7.3); accepted items rerun rules.
import {afterRulesForItem} from './quarantine-hook-rules';
import type {CoreDeps} from './deps';
import type {QuarantineResolution} from './types';
export type BrokerResolveOutcome='resolved'|'already_resolved'|'not_found';
export async function resolveBrokerItem(deps:Pick<CoreDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>,item:{id:string;natural_key:string},input:{status:QuarantineResolution;by:string;payload:Record<string,unknown>}):Promise<{outcome:BrokerResolveOutcome;rules:'ok'|'failed'|'skipped'}>{
 const outcome=await deps.db.quarantineResolve(item.id,input.status,input.by,input.payload);
 if(outcome!=='resolved'||input.status!=='resolved_accept')return {outcome,rules:'skipped'};
 return {outcome,rules:await afterRulesForItem(deps,item.natural_key)};
}
