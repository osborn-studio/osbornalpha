// src/lib/company/handlers/statements.ts
// GET /api/companies/[ticker]/statements (spec §5.3, §6.1, §0 #66): one snapshot read of
// gridReadConcepts(statement, basis, market) (history only for quarterly) → Task 7 buildStatementsGrid
// or a revision/membership-fenced lineage envelope for merged issuer disclosure history.
// (disclosed/annual = current disclosures; quarterly = deriveMetrics q_single_* on the SAME envelope; CN
// q_single_revenue is 营业总收入). BS has no quarterly basis. Every displayed factId (grid.factIds: fact cells
// and all inputs of derived cells) goes through buildGated; truncated → 200 truncated:true with nothing
// partial. otherUnitOnly (Task 7) is passed through so the UI renders "—" + U for other-unit-only periods.
import {resolveReadIssuer,readTargetUnchanged} from './target-fence';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {lineageRevsEqual} from '@/lib/facts/db';
import {QueryError,publicConflict} from '@/lib/facts/public-route';
import type {LineageRev} from '@/lib/facts/types';
import {inGateScope} from '../fact-scope';
import {buildStatementsGrid,gridReadConcepts} from '../statements-grid';
import type {GridPeriods} from '../statements-grid';
import {RouteError,buildGated,countWithheld,gateCell,gateFilingOf} from '../route';
import type {Handler} from '../route';
import type {Basis,EvidenceDto,FilingSummary,GridRow,PeriodCol,StatementKind,WithheldCounts} from '../types';

export const STATEMENTS_PARAMS=['statement','basis','periods','asOf'] as const;
const STATEMENTS=new Set<StatementKind>(['IS','BS','CF']);
const BASES=new Set<Basis>(['disclosed','annual','quarterly']);
const PERIODS=new Set(['8','20','40']);
export interface StatementsDto{
 issuerId:string;ticker:string;market:'US'|'CN';asOf:string;mappingGen:number;stateRev:number;truncated:boolean;statement:StatementKind;basis:Basis;
 lineage:string[];stateRevs:LineageRev[];conflicts:ReturnType<typeof publicConflict>[];
 /** Source owner of each displayed fact or derived input; identity normalization never changes provenance. */
 factOwners:Record<string,string>;
 periods:PeriodCol[];rows:GridRow[];filings:Record<string,FilingSummary>;
 /** concept → period keys where only a non-primary unit was disclosed (cell is null; UI shows "—" + U). */
 otherUnitOnly:Record<string,string[]>;
 /** concept → period keys with a primary-unit value AND other-unit facts (U badge on the value cell). */
 otherUnitsAlso:Record<string,string[]>;
 evidence:Record<string,EvidenceDto>;withheld:WithheldCounts;
}
export const statementsHandler:Handler=async(ctx)=>{
 const {params:p,deps,asOf}=ctx;
 const statement=p.get('statement') as StatementKind|undefined;
 if(!statement||!STATEMENTS.has(statement))throw new QueryError('statement');
 const basis=(p.get('basis')??'disclosed') as Basis;
 if(!BASES.has(basis)||(basis==='quarterly'&&statement==='BS'))throw new QueryError('basis');
 const periods=p.get('periods')??'8';
 if(!PERIODS.has(periods))throw new QueryError('periods');
 const quarterly=basis==='quarterly';
 const canonical=(members:string[])=>[...new Set(members)].sort();
 const sameMembers=(a:string[],b:string[])=>a.join(',')===b.join(',');
 for(let attempt=0;attempt<3;attempt++){
  const issuer=await resolveReadIssuer(ctx);if(!issuer)continue;
  const attemptCtx={...ctx,issuer};
  const opts={concepts:gridReadConcepts(statement,basis,issuer.market),asOf,history:quarterly};
  const lineage=canonical(await deps.facts.lineageOf(issuer.issuerId));
  if(!lineage.includes(issuer.issuerId))continue;
  const multi=lineage.length>1;
  const complete=(v:LineageRev[])=>v.length===lineage.length&&sameMembers(v.map(r=>r.issuer_id).sort(),lineage)&&v.every(r=>Number.isSafeInteger(r.state_rev)&&r.state_rev>=0);
  const before=multi?await deps.facts.stateRevs(lineage,issuer.market):null;
  if(before&&!complete(before))continue;
  const envelope=multi?await deps.facts.readFactsLineage(lineage,issuer.market,opts):null;
  if(envelope&&(!sameMembers(envelope.lineage.slice().sort(),lineage)||!complete(envelope.stateRevs)||!lineageRevsEqual(before!,envelope.stateRevs)))continue;
  const members=new Set(lineage);
  const snap=envelope?{
   stateRev:envelope.stateRevs.find(r=>r.issuer_id===issuer.issuerId)!.state_rev,
   rows:envelope.rows.filter(r=>inGateScope(r,members,issuer.market,asOf)),truncated:envelope.truncated,
   filings:envelope.truncated?[]:(await deps.lineageFilings(lineage,issuer.market))
    .filter(f=>members.has(f.issuer_id)&&f.market===issuer.market&&f.mapping_gen>0&&f.available_date<=asOf).map(gateFilingOf),
  }:await deps.snapshot(issuer.issuerId,issuer.market,opts);
  const stateRevs=envelope?.stateRevs??[{issuer_id:issuer.issuerId,state_rev:snap.stateRev}];
  // Fence through all reads, including evidence/PDF. A single RPC already binds facts and filings.
  const stable=async()=>{
   if(!sameMembers(lineage,canonical(await deps.facts.lineageOf(issuer.issuerId))))return false;
   if(!before)return readTargetUnchanged(ctx,issuer);
   const after=await deps.facts.stateRevs(lineage,issuer.market);
   return complete(after)&&lineageRevsEqual(before,after)&&await readTargetUnchanged(ctx,issuer);
  };
  const head={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf,mappingGen:MAPPING_GEN,stateRev:snap.stateRev,truncated:snap.truncated,statement,basis,lineage,stateRevs,conflicts:(envelope?.conflicts??[]).map(publicConflict)};
  const none={periods:[],rows:[],filings:{},factOwners:{},otherUnitOnly:{},otherUnitsAlso:{},evidence:{},withheld:{evidenceIncomplete:0,citationPending:0}};
  if(snap.truncated){if(!await stable())continue;const body:StatementsDto={...head,...none};return {body,empty:true};}
  // Same identity normalization as deriveLineageMetrics: the backend already selected one
  // globally sequenced disclosure stream and removed conflicts. Never sum issuer balances.
  // Keep original owners for the gate; only the pure quarterly derivation sees relabelled IDs.
  const gridSnap=multi&&quarterly?{...snap,rows:snap.rows.map(r=>({...r,issuer_id:issuer.issuerId}))}:snap;
  const grid=buildStatementsGrid(gridSnap,{statement,basis,periods:Number(periods) as GridPeriods,market:issuer.market,asOf});
  if(!grid.ok){if(grid.error==='invalid_basis')throw new QueryError('basis');if(!await stable())continue;const body:StatementsDto={...head,truncated:true,...none};return {body,empty:true};}
  // An authoritative lineage envelope must never refill excluded rows or missing owner metadata.
  const gateCtx=multi?{...attemptCtx,lineage:members,deps:{...deps,facts:{...deps.facts,factsByIds:async()=>[],filingsOfIssuer:async()=>[]}}}:attemptCtx;
  const g=await buildGated(gateCtx,grid.factIds,snap.rows,snap.filings);
  if(!await stable())continue;
  const used=new Set(grid.factIds);
  const factOwners=Object.fromEntries(snap.rows.filter(r=>used.has(r.fact_id)).map(r=>[r.fact_id,r.issuer_id]));
  const rows=grid.rows.map(r=>({...r,cells:Object.fromEntries(Object.entries(r.cells).map(([k,c])=>[k,gateCell(c,g)]))}));
  const body:StatementsDto={...head,periods:grid.periods,rows,filings:grid.filings,factOwners,otherUnitOnly:grid.otherUnitOnly,otherUnitsAlso:grid.otherUnitsAlso,evidence:g.evidence,withheld:countWithheld(rows.flatMap(r=>Object.values(r.cells)))};
  return {body,empty:grid.periods.length===0};
 }
 throw new RouteError('lineage_unstable',503,'issuer lineage changed during statements read');
};
