import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {digest} from '../ingest/pa-v1/json.js';
import {validateArmS4Lineage,type ArmLineageRecord} from './arm-lineage';
import type {ArmRoutingRow} from './arm-eligibility';
// These are explicit synthetic relationship fixtures, not positive database/receipt evidence.
function fixture(){
 const owner=randomUUID(),candidate=randomUUID(),ids=Array.from({length:6},()=>randomUUID()),thesis=randomUUID();
 const row:ArmRoutingRow={decision_id:randomUUID(),thesis_id:thesis,week_of:'2026-10-05',arm:'collab',action:'adopt',observation_id:ids[0],research_card_id:randomUUID()};
 const payloads=[{observation_kind:'decision',id:ids[0],candidate_ref:candidate,decision_or_candidate_ref:ids[1],input_snapshot_ref:ids[2],input_snapshot_hash:'',thesis_revision_ref:ids[4]}, {action:'adopt',observation_ref:ids[0],input_snapshot_ref:ids[2],card_ref:ids[3],prior_label_ref:ids[5],thesis_revision_ref:ids[4]}, {card_ref:ids[3],card_hash:'',label_ref:ids[5],thesis_revision_ref:ids[4]}, {thesis_id:thesis,thesis_revision_ref:ids[4]}, {thesis_id:thesis}, {phase:'before_display',evaluation_period_id:row.week_of}];
 payloads[2].card_hash=digest(payloads[3]);payloads[0].input_snapshot_hash=digest(payloads[2]);
 const records:ArmLineageRecord[]=payloads.map((payload,i)=>({id:ids[i],user_id:owner,candidate_id:candidate,kind:['Observation','Decision','InputSnapshot','ChangeCard','ThesisRevision','HumanLabel'][i],payload,payload_hash:digest(payload)}));
 return {owner,row,records};
}
describe('S4 arm lineage only, not disclosure authorization',()=>{
 it('accepts exact linked records while retaining distinct ResearchCard and ChangeCard namespaces',()=>{const f=fixture();const out=validateArmS4Lineage(f.owner,f.row,f.records);expect(out.s4_change_card_id).not.toBe(f.row.research_card_id);expect(Object.isFrozen(out)).toBe(true);});
 it('rejects a thesis revision reused from a different candidate sharing the same thesis',()=>{const f=fixture();f.records[4].candidate_id=randomUUID();expect(()=>validateArmS4Lineage(f.owner,f.row,f.records)).toThrow('hash_mismatch');});
 it('rejects action relabeling and unsupported ledger action semantics',()=>{for(const action of ['reject','shadow','extend','invalidate'] as const){const f=fixture();expect(()=>validateArmS4Lineage(f.owner,{...f.row,action},f.records)).toThrow('not_configured');}});
 it('accepts rejection only with a consistently hashed shadow observation',()=>{const f=fixture();f.row.action='reject';f.records[1].payload.action='reject';f.records[1].payload_hash=digest(f.records[1].payload);expect(()=>validateArmS4Lineage(f.owner,f.row,f.records)).toThrow('not_configured');f.records[0].payload.observation_kind='shadow';f.records[0].payload_hash=digest(f.records[0].payload);expect(validateArmS4Lineage(f.owner,f.row,f.records).observation_id).toBe(f.row.observation_id);});
 it('does not accept unspecified synthetic label provenance as a human baseline',()=>{const f=fixture();expect(()=>validateArmS4Lineage(f.owner,{...f.row,arm:'human_baseline'},f.records)).toThrow('not_configured');});
 it('rejects missing, extra and duplicate records',()=>{const f=fixture();for(const records of [f.records.slice(1),[...f.records,f.records[0]],[f.records[0],...f.records.slice(0,5)]])expect(()=>validateArmS4Lineage(f.owner,f.row,records)).toThrow('hash_mismatch');});
 it('rejects owner, candidate, kind and payload tampering at every hop',()=>{for(let i=0;i<6;i++)for(const patch of [{user_id:randomUUID()},{candidate_id:randomUUID()},{kind:'Review'},{payload:{tampered:true}}]){const f=fixture();Object.assign(f.records[i],patch);expect(()=>validateArmS4Lineage(f.owner,f.row,f.records)).toThrow('hash_mismatch');}});
 it('rejects a consistently rehashed decision linked to another observation',()=>{const f=fixture();f.records[1].payload.observation_ref=randomUUID();f.records[1].payload_hash=digest(f.records[1].payload);expect(()=>validateArmS4Lineage(f.owner,f.row,f.records)).toThrow('hash_mismatch');});
 it('rejects wrong thesis and period without equating observation dates to ledger weeks',()=>{for(const patch of [{thesis_id:randomUUID()},{week_of:'2026-10-12'}]){const f=fixture();expect(()=>validateArmS4Lineage(f.owner,{...f.row,...patch},f.records)).toThrow('not_configured');}});
});
