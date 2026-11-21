// Membership is current because merges have no date. As in filings, metrics and statements,
// asOf bounds facts and filings only. Fence every read through the final evidence gate.
// Send concepts:null as the full CONCEPT_IDS list because ReadFactsOptions.concepts is a required list.
import {CONCEPT_IDS} from '@/lib/facts/concepts';
import {lineageRevsEqual} from '@/lib/facts/db';
import {publicConflict,type PublicIssuer} from '@/lib/facts/public-route';
import type {FactRow,LineageRev} from '@/lib/facts/types';
import {inGateScope} from './fact-scope';
import {readTargetUnchanged,resolveReadIssuer} from './handlers/target-fence';
import {RouteError,type GateFiling,type RouteCtx} from './route';
import type {ReadSnapshotOptions} from './types';

interface Envelope{rows:FactRow[];truncated:boolean;conflicts:ReturnType<typeof publicConflict>[]}
export interface LineageRead extends Envelope{
 issuer:PublicIssuer;lineage:string[];members:ReadonlySet<string>;stateRevs:LineageRev[];targetRev:number;
 filings:GateFiling[];gateCtx:RouteCtx&{lineage:ReadonlySet<string>};
 read(opts:ReadSnapshotOptions):Promise<Envelope|null>;
 stable():Promise<boolean>;
 ownersOf(factIds:Iterable<string>):Record<string,string>;
 relabelled(rows:FactRow[]):FactRow[];
}
const canonical=(ids:string[])=>[...new Set(ids)].sort();
const same=(a:string[],b:string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
export async function lineageMembers(ctx:RouteCtx):Promise<string[]>{
 return canonical(await ctx.deps.facts.lineageOf(ctx.issuer.issuerId));
}
export async function readLineage(ctx:RouteCtx,opts:ReadSnapshotOptions):Promise<LineageRead|null>{
 const issuer=await resolveReadIssuer(ctx);if(!issuer)return null;
 const {deps}=ctx,{issuerId,market}=issuer;
 const lineage=await lineageMembers({...ctx,issuer}),members=new Set(lineage);
 if(lineage.length<2||!members.has(issuerId))return null;
 const complete=(v:LineageRev[])=>same(v.map(r=>r.issuer_id).sort(),lineage)&&v.every(r=>Number.isSafeInteger(r.state_rev)&&r.state_rev>=0);
 const stateRevs=await deps.facts.stateRevs(lineage,market);
 if(!complete(stateRevs))return null;
 const matches=(v:LineageRev[])=>complete(v)&&lineageRevsEqual(stateRevs,v);
 const owners=new Map<string,string>();
 const read=async(options:ReadSnapshotOptions)=>{
  // The lineage RPC takes an explicit concept list, including for an all-concept snapshot.
  const env=await deps.facts.readFactsLineage(lineage,market,{...options,concepts:options.concepts??[...CONCEPT_IDS],from:options.from??undefined,to:options.to??undefined});
  if(!same([...env.lineage].sort(),lineage)||!matches(env.stateRevs))return null;
  const rows=env.rows.filter(r=>inGateScope(r,members,market,options.asOf));
  for(const r of rows)owners.set(r.fact_id,r.issuer_id);
  return {rows,truncated:env.truncated,conflicts:env.conflicts.map(publicConflict)};
 };
 const main=await read(opts);if(!main)return null;
 const filings:GateFiling[]=[];
 const snaps=await Promise.all(lineage.map(id=>deps.snapshot(id,market,{concepts:['revenue'],asOf:opts.asOf,history:false,limit:1})));
 if(!matches(snaps.map((s,i)=>({issuer_id:lineage[i],state_rev:s.stateRev}))))return null;
 for(const [i,s] of snaps.entries())for(const f of s.filings)if(f.mappingGen>0&&f.availableDate<=opts.asOf)filings.push({...f,issuerId:lineage[i],market});
 filings.sort((a,b)=>a.availableDate<b.availableDate?1:a.availableDate>b.availableDate?-1:a.filingId<b.filingId?1:a.filingId>b.filingId?-1:0);
 const gateCtx={...ctx,issuer,lineage:members,deps:{...deps,facts:{...deps.facts,factsByIds:async()=>[],filingsOfIssuer:async()=>[]}}};
 return {...main,issuer,lineage,members,stateRevs,targetRev:stateRevs.find(r=>r.issuer_id===issuerId)!.state_rev,filings,gateCtx,read,
  stable:async()=>same(lineage,await lineageMembers(gateCtx))&&matches(await deps.facts.stateRevs(lineage,market))&&await readTargetUnchanged(ctx,issuer),
  ownersOf:ids=>Object.fromEntries(Array.from(ids).filter(id=>owners.has(id)).map(id=>[id,owners.get(id)!])),
  relabelled:rows=>rows.map(r=>r.issuer_id===issuerId?r:{...r,issuer_id:issuerId}),
 };
}
export async function withLineageRetry<T>(tag:string,attempt:()=>Promise<T|null>):Promise<T>{
 for(let i=0;i<3;i++){const result=await attempt();if(result!==null)return result;}
 throw new RouteError('lineage_unstable',503,`issuer lineage changed during ${tag} read`);
}
