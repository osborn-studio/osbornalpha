// src/lib/industry/replay.ts
// replayFromManifest (spec §5.3, §5.5 mode=original), pure: recomputes every cell of an aggregate
// manifest from the manifest alone — facts, derived and roles — through the same pickInputs /
// finalizeCell code the run used, and compares each recomputed cell with the stored one by canonical
// JSON. Structural counts come from the manifest: n_members = distinct members[].issuer_id,
// n_unresolved = distinct unresolved[].ts_code; the financial flag is "every role of the
// gross_margin cell is excluded:financial_excluded". An included issuer whose inputs are absent or
// ambiguous in the manifest yields missing:manifest_mismatch for that cell (so it cannot reproduce).
// No database, no clock, no METHOD_CONFIG: an old manifest replays under the code that reads it.
import {InputIndex,finalizeCell,pickInputs} from './aggregate';
import type {PoolDerived,PoolFact} from './aggregate';
import {canonicalJson} from './canonical-json';
import type {CellSpec} from './method';
import type {AggregateManifest,ManifestCell} from './types';

export interface ReplayResult{cells:ManifestCell[];reproduced:boolean;mismatches:string[]}
const cellId=(c:Pick<ManifestCell,'metric'|'duration'|'period_start'>)=>`${c.metric}:${c.duration}:${c.period_start}`;

export function replayFromManifest(m:AggregateManifest):ReplayResult{
 if(m.schema!=='industry-manifest/2'||m.kind!=='aggregate')throw new Error('unsupported_manifest');
 const nMembers=new Set(m.members.map(x=>x.issuer_id)).size;
 const nUnresolved=new Set(m.unresolved.map(u=>u.ts_code)).size;
 const facts:PoolFact[]=m.facts.map(f=>({issuer_id:f.issuer_id,concept:f.concept,period_start:f.period_start,period_end:f.period_end,duration:f.duration,unit:f.unit,value:f.value_text}));
 const derived:PoolDerived[]=m.derived.map(d=>({issuer_id:d.issuer_id,metric:d.metric,period_start:d.period_start,period_end:d.period_end,duration:d.duration,unit:d.unit,value:d.value}));
 const idx=new InputIndex(facts,derived);
 const cells:ManifestCell[]=[];const mismatches:string[]=[];
 for(const stored of m.cells){
  const spec:CellSpec={metric:stored.metric,duration:stored.duration,period_start:stored.period_start,period_end:m.period_end,unit:stored.unit as CellSpec['unit']};
  const roles=m.roles.filter(r=>r.metric===stored.metric&&r.duration===stored.duration);
  const financial=stored.metric==='gross_margin'&&roles.length>0&&roles.every(r=>r.role==='excluded'&&r.reason==='financial_excluded');
  const included:string[][]=[];let broken=false;
  if(stored.metric!=='member_count'){
   for(const r of roles){
    if(r.role!=='included')continue;
    const p=pickInputs(spec,r.issuer_id,idx);
    if(!p.ok){broken=true;break;}
    included.push(p.values);
   }
  }
  const cell:ManifestCell=broken
   ?{metric:stored.metric,duration:stored.duration,period_start:stored.period_start,status:'missing',missing_reason:'manifest_mismatch',n_members:nMembers,n_with_data:0,n_unresolved:nUnresolved,unit:stored.unit}
   :finalizeCell(spec,nMembers,nUnresolved,financial,included);
  cells.push(cell);
  if(canonicalJson(cell)!==canonicalJson(stored))mismatches.push(cellId(stored));
 }
 return {cells,reproduced:mismatches.length===0,mismatches};
}
