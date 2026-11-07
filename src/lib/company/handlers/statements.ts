// src/lib/company/handlers/statements.ts
// GET /api/companies/[ticker]/statements (spec §5.3, §6.1, §0 #66): one snapshot read of
// gridReadConcepts(statement, basis, market) (history only for quarterly) → Task 7 buildStatementsGrid
// (disclosed/annual = current disclosures; quarterly = deriveMetrics q_single_* on the SAME envelope; CN
// q_single_revenue is 营业总收入). BS has no quarterly basis. Every displayed factId (grid.factIds: fact cells
// and all inputs of derived cells) goes through buildGated; truncated → 200 truncated:true with nothing
// partial. otherUnitOnly (Task 7) is passed through so the UI renders "—" + U for other-unit-only periods.
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {QueryError} from '@/lib/facts/public-route';
import {buildStatementsGrid,gridReadConcepts} from '../statements-grid';
import type {GridPeriods} from '../statements-grid';
import {buildGated,countWithheld,gateCell} from '../route';
import type {Handler} from '../route';
import type {Basis,EvidenceDto,FilingSummary,GridRow,PeriodCol,StatementKind,WithheldCounts} from '../types';

export const STATEMENTS_PARAMS=['statement','basis','periods','asOf'] as const;
const STATEMENTS=new Set<StatementKind>(['IS','BS','CF']);
const BASES=new Set<Basis>(['disclosed','annual','quarterly']);
const PERIODS=new Set(['8','20','40']);
export interface StatementsDto{
 issuerId:string;ticker:string;market:'US'|'CN';asOf:string;mappingGen:number;stateRev:number;truncated:boolean;statement:StatementKind;basis:Basis;
 periods:PeriodCol[];rows:GridRow[];filings:Record<string,FilingSummary>;
 /** concept → period keys where only a non-primary unit was disclosed (cell is null; UI shows "—" + U). */
 otherUnitOnly:Record<string,string[]>;
 /** concept → period keys with a primary-unit value AND other-unit facts (U badge on the value cell). */
 otherUnitsAlso:Record<string,string[]>;
 evidence:Record<string,EvidenceDto>;withheld:WithheldCounts;
}
export const statementsHandler:Handler=async(ctx)=>{
 const {params:p,issuer,deps,asOf}=ctx;
 const statement=p.get('statement') as StatementKind|undefined;
 if(!statement||!STATEMENTS.has(statement))throw new QueryError('statement');
 const basis=(p.get('basis')??'disclosed') as Basis;
 if(!BASES.has(basis)||(basis==='quarterly'&&statement==='BS'))throw new QueryError('basis');
 const periods=p.get('periods')??'8';
 if(!PERIODS.has(periods))throw new QueryError('periods');
 const quarterly=basis==='quarterly';
 const concepts=gridReadConcepts(statement,basis,issuer.market);
 const snap=await deps.snapshot(issuer.issuerId,issuer.market,{concepts,asOf,history:quarterly});
 const head={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf,mappingGen:MAPPING_GEN,stateRev:snap.stateRev,truncated:snap.truncated,statement,basis};
 const none={periods:[],rows:[],filings:{},otherUnitOnly:{},otherUnitsAlso:{},evidence:{},withheld:{evidenceIncomplete:0,citationPending:0}};
 if(snap.truncated){const body:StatementsDto={...head,...none};return {body,empty:true};}
 const grid=buildStatementsGrid(snap,{statement,basis,periods:Number(periods) as GridPeriods,market:issuer.market,asOf});
 if(!grid.ok){if(grid.error==='invalid_basis')throw new QueryError('basis');const body:StatementsDto={...head,truncated:true,...none};return {body,empty:true};}
 const g=await buildGated(ctx,grid.factIds,snap.rows,snap.filings);
 const rows=grid.rows.map(r=>({...r,cells:Object.fromEntries(Object.entries(r.cells).map(([k,c])=>[k,gateCell(c,g)]))}));
 const body:StatementsDto={...head,periods:grid.periods,rows,filings:grid.filings,otherUnitOnly:grid.otherUnitOnly,otherUnitsAlso:grid.otherUnitsAlso,evidence:g.evidence,withheld:countWithheld(rows.flatMap(r=>Object.values(r.cells)))};
 return {body,empty:grid.periods.length===0};
};
