// src/lib/industry/replay.ts
// replayFromManifest (spec §5.3, §5.5 mode=original), pure: recomputes every cell of an aggregate
// manifest from the manifest alone — facts, derived and roles — through the same pickInputs /
// finalizeCell code the run used, and compares each recomputed cell with the stored one by canonical
// JSON. Structural counts come from the manifest: n_members = distinct members[].issuer_id,
// n_unresolved = distinct unresolved[].ts_code; the financial flag is "every role of the
// gross_margin cell is excluded:financial_excluded". An included issuer whose inputs are absent or
// ambiguous in the manifest yields missing:manifest_mismatch for that cell (so it cannot reproduce).
// replayCell validates ONLY the requested cell (the single-cell payload the replay endpoint returns); the
// full-grid check stays in replayFromManifest (ingestion).
// No database, no clock, no METHOD_CONFIG: an old manifest replays under the code that reads it.
import {InputIndex,finalizeCell,pickInputs} from './aggregate';
import type {PoolDerived,PoolFact} from './aggregate';
import {canonicalJson} from './canonical-json';
import {MANIFEST_SCHEMA} from './manifest';
import {cellSpecs} from './method';
import type {CellSpec} from './method';
import type {AggregateManifest,ManifestCell} from './types';

export interface ReplayResult{cells:ManifestCell[];reproduced:boolean;mismatches:string[]}
export interface CellReplay{cell:ManifestCell|null;reproduced:boolean;mismatches:string[]}
type CellKey=Pick<ManifestCell,'metric'|'duration'|'period_start'>;
const cellId=(c:CellKey)=>`${c.metric}:${c.duration}:${c.period_start}`;

interface Ctx{m:AggregateManifest;nMembers:number;nUnresolved:number;idx:InputIndex<PoolFact,PoolDerived>;expected:Map<string,CellSpec>}
function contextOf(m:AggregateManifest):Ctx{
 if(m.schema!==MANIFEST_SCHEMA||m.kind!=='aggregate')throw new Error('unsupported_manifest');
 const facts:PoolFact[]=m.facts.map(f=>({issuer_id:f.issuer_id,concept:f.concept,period_start:f.period_start,period_end:f.period_end,duration:f.duration,unit:f.unit,value:f.value_text}));
 const derived:PoolDerived[]=m.derived.map(d=>({issuer_id:d.issuer_id,metric:d.metric,period_start:d.period_start,period_end:d.period_end,duration:d.duration,unit:d.unit,value:d.value}));
 return {m,nMembers:new Set(m.members.map(x=>x.issuer_id)).size,nUnresolved:new Set(m.unresolved.map(u=>u.ts_code)).size,idx:new InputIndex(facts,derived),
  // the grid and the units are method facts, not manifest claims: the stored cells must be exactly cellSpecs(period_end)
  expected:new Map(cellSpecs(m.period_end).map(s=>[cellId(s),s]))};
}
/** Recomputes one stored cell from the manifest's roles and inputs; pushes unexpected_cell / value mismatches. */
function replayStored(c:Ctx,stored:ManifestCell,mismatches:string[]):ManifestCell{
 const known=c.expected.get(cellId(stored));
 if(!known)mismatches.push(`unexpected_cell:${cellId(stored)}`);
 const spec:CellSpec=known??{metric:stored.metric,duration:stored.duration,period_start:stored.period_start,period_end:c.m.period_end,unit:stored.unit as CellSpec['unit']};
 const roles=c.m.roles.filter(r=>r.metric===stored.metric&&r.duration===stored.duration);
 const financial=stored.metric==='gross_margin'&&roles.length>0&&roles.every(r=>r.role==='excluded'&&r.reason==='financial_excluded');
 const included:string[][]=[];let broken=false;
 if(stored.metric!=='member_count'){
  for(const r of roles){
   if(r.role!=='included')continue;
   const p=pickInputs(spec,r.issuer_id,c.idx);
   if(!p.ok){broken=true;break;}
   included.push(p.values);
  }
 }
 const cell:ManifestCell=broken
  ?{metric:stored.metric,duration:stored.duration,period_start:stored.period_start,status:'missing',missing_reason:'manifest_mismatch',n_members:c.nMembers,n_with_data:0,n_unresolved:c.nUnresolved,unit:stored.unit}
  :finalizeCell(spec,c.nMembers,c.nUnresolved,financial,included);
 if(known&&canonicalJson(cell)!==canonicalJson(stored))mismatches.push(cellId(stored));
 return cell;
}

export function replayFromManifest(m:AggregateManifest):ReplayResult{
 const c=contextOf(m);
 const cells:ManifestCell[]=[];const mismatches:string[]=[];
 const storedIds=new Set(m.cells.map(cellId));
 for(const id of c.expected.keys())if(!storedIds.has(id))mismatches.push(`missing_cell:${id}`);
 for(const stored of m.cells)cells.push(replayStored(c,stored,mismatches));
 return {cells,reproduced:mismatches.length===0,mismatches};
}

/**
 * Replay of ONE cell of a (possibly per-cell filtered) manifest: the requested cell must be on the method grid
 * and stored exactly once; only its own roles and inputs are used, so the single-cell payload the endpoint
 * returns validates on its own. `reproduced` = the stored cell equals the recomputed one.
 */
export function replayCell(m:AggregateManifest,key:CellKey):CellReplay{
 const c=contextOf(m);
 const mismatches:string[]=[];
 const id=cellId(key);
 const stored=m.cells.filter(x=>cellId(x)===id);
 if(!c.expected.has(id)){mismatches.push(`unexpected_cell:${id}`);return {cell:null,reproduced:false,mismatches};}
 if(stored.length===0){mismatches.push(`missing_cell:${id}`);return {cell:null,reproduced:false,mismatches};}
 if(stored.length>1)mismatches.push(`duplicate_cell:${id}`);
 const cell=replayStored(c,stored[0],mismatches);
 return {cell,reproduced:mismatches.length===0,mismatches};
}
