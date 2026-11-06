// src/lib/entities/identifiers/plan.ts
// Pure planning of ISIN/FIGI writes (spec §4.1.2–§4.1.4). Inputs: the run's evidence (GLEIF subset,
// OpenFIGI job results by ISIN and by ticker, merged HKEX lists) and the current open security rows.
// Output: guarded column writes (one sanitized provenance key each), claim/1 claims, ownership
// quarantines and HKEX-vs-GLEIF text reconciliations. A stored value is never overwritten: a
// different value becomes correct_identifier. Several candidate values for one row/column are
// ambiguous and only produce claims. HK tickers found for an issuer that holds A shares are left
// to link-ah (spec §4.2.2 rule 1; contract issue 5).
import type {ClaimInput} from '../claims';
import {sanitizeProvenance} from '../provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,EvidenceKind} from '../types';
import type {HkexIsin} from './hkex-list';
import {groupFigiResults,type FigiGroup,type FigiJob,type FigiJobResult} from './openfigi';

export const ISIN_RECON_PAIR='entities.isin_hkex_vs_gleif' as const;
export type Stage='A'|'B'|'C'|'D';
export interface SecRow{issuer_id:string;ticker:string;valid_from:string;isin:string|null;figi:string|null;provenance:Record<string,unknown>}
export interface IssuerRow{issuer_id:string;lei:string|null;usci:string|null}
export interface PlanInput{
 asOf:string;stages:ReadonlySet<Stage>;
 /** the run's active issuers */
 issuers:readonly IssuerRow[];
 /** ALL open (valid_to null) security rows: ownership lookups use every issuer's rows */
 openRows:readonly SecRow[];
 universe:ReadonlySet<string>;
 gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>}|null;
 isinResults:ReadonlyMap<string,FigiJobResult>;
 tickerResults:ReadonlyMap<string,FigiJobResult>;
 /** 5-digit stock code → ISIN (mergeHkexIsins); null or empty = no HKEX ISIN source this run */
 hkex:ReadonlyMap<string,HkexIsin>|null;
}
export type IdColumn='isin'|'figi';
export interface SecurityWrite{
 kind:'set'|'provenance';issuer_id:string;ticker:string;valid_from:string;column:IdColumn;value:string;
 /** exactly one sanitized provenance key ({isin:…} or {figi:…}); apply merges it into the stored object */
 patch:Record<string,unknown>;source:string;evidenceKind:EvidenceKind;evidence:ClaimEvidence;
}
export interface PlannedQuarantine{naturalKey:string;reasonCode:'ownership_conflict';detail:Record<string,unknown>;payload:Record<string,unknown>}
export interface PlannedRecon{naturalKey:string;passed:boolean;leftText:string;rightText:string;leftSource:string;rightSource:string;detail:Record<string,unknown>}
export interface AhCandidate{issuer_id:string;ticker:string;isin:string;evidence:ClaimEvidence}
export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}

interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>}
type Op=Exclude<ClaimOp,'legacy'>;
const keyOf=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
const targetOf=(r:SecRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from});
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};

export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
 const {asOf,stages}=input;
 const out:IdentifierPlan={writes:[],claims:[],quarantines:[],recons:[],duplicates:0,skipped:[],figiMissing:[],ahCandidates:[]};
 const runIds=new Set(input.issuers.map(i=>i.issuer_id));
 const runRows=input.openRows.filter(r=>runIds.has(r.issuer_id));
 const openOwner=new Map(input.openRows.map(r=>[r.ticker,r.issuer_id]));
 const holdsA=new Set(input.openRows.filter(r=>/\.(SH|SZ)$/.test(r.ticker)).map(r=>r.issuer_id));
 const proposals=new Map<string,{row:SecRow;col:IdColumn;list:Proposal[]}>();
 const figiClaimed=new Set<string>();
 const propose=(row:SecRow,col:IdColumn,p:Proposal)=>{
  const k=`${keyOf(row)}|${col}`;
  const e=proposals.get(k)??{row,col,list:[]};
  if(!e.list.some(x=>x.value===p.value))e.list.push(p);
  proposals.set(k,e);
 };
 const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;written?:Record<string,unknown>})=>{
  out.claims.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:[c.evidence],...(c.written?{provenance_written:c.written}:{}),
  }});
 };
 const figiProposal=(r:Extract<FigiJobResult,{status:'ok'}>,g:FigiGroup):Proposal=>({
  value:g.figi,source:'openfigi',kind:'provider_mapping',
  evidence:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`},
  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
 });
 const multiFigi=(row:SecRow,r:Extract<FigiJobResult,{status:'ok'}>,groups:FigiGroup[])=>{
  figiClaimed.add(keyOf(row));
  out.skipped.push('figi_multiple_groups');
  if(groups.some(g=>g.figi===row.figi)){out.duplicates++;return;}
  const note=`one of ${groups.length} candidate FIGIs: ${groups.map(g=>`${g.figi}(${g.level})`).join(', ')}`;
  // spec §4.1.2 "detail.candidates 全部列出": every per-group claim carries the full sorted list in params.candidates
  // (Part A validateClaimDetail/identifier_claim_problem allow params.candidates for set_identifier/correct_identifier).
  const candidates=groups.map(g=>({figi:g.figi,level:g.level}));
  for(const g of groups){
   const p=figiProposal(r,g);
   const op:Op=row.figi===null?'set_identifier':'correct_identifier';
   claim({issuer_id:row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(row),
    params:op==='set_identifier'?{candidates}:{expected_current:row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
  }
 };

 // Stage B: ISIN (from GLEIF, stage A) → OpenFIGI → (issuer via LEI, normalized ticker).
 if(stages.has('B')&&input.gleif){
  for(const iss of input.issuers){
   if(!iss.lei)continue;
   for(const isin of input.gleif.byLei.get(iss.lei)??[]){
    const r=input.isinResults.get(isin);
    if(!r){out.skipped.push('figi_not_queried');continue;}
    if(r.status!=='ok'){out.skipped.push(`openfigi_${r.status}`);continue;}
    const g=groupFigiResults(r.records);
    out.skipped.push(...g.skipped);
    const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
    const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
    for(const c of g.candidates){
     const own=runRows.find(x=>x.issuer_id===iss.issuer_id&&x.ticker===c.ticker);
     if(own){
      propose(own,'isin',isinProposal);
      if(c.groups.length===1)propose(own,'figi',figiProposal(r,c.groups[0]));
      else multiFigi(own,r,c.groups);
      continue;
     }
     if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
     const owner=openOwner.get(c.ticker);
     if(owner===undefined&&c.market==='HK'&&holdsA.has(iss.issuer_id)){
      out.ahCandidates.push({issuer_id:iss.issuer_id,ticker:c.ticker,isin,evidence});out.skipped.push('ah_link_candidate');continue;
     }
     claim({issuer_id:iss.issuer_id,id_type:'ticker',value:c.ticker,source:'gleif_openfigi',op:'attach_security',kind:'provider_mapping',target:{issuer_id:iss.issuer_id},
      params:{share_class:'unknown',valid_from:asOf,valid_from_method:'first_observed',source:'gleif_openfigi',isin},
      // an ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK, TCTZF): this one is only a co-mapping, so the reviewer must confirm it is the issuer's own listing
      evidence:{...evidence,note:`ticker ${c.ticker} co-mapped by ISIN ${isin}; listing not confirmed`}});
     if(owner!==undefined)out.quarantines.push({naturalKey:`${c.ticker}:${asOf}`,reasonCode:'ownership_conflict',
      detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:owner},payload:{issuer_id:iss.issuer_id,ticker:c.ticker,isin}});
    }
   }
  }
 }

 // Stage D: HKEX is the primary ISIN source for .HK rows; stage-B values are compared, not written.
 if(stages.has('D')){
  if(!input.hkex||input.hkex.size===0)out.skipped.push('hkex_no_isin');
  else for(const row of runRows){
   const m=/^(\d{5})\.HK$/.exec(row.ticker);
   if(!m)continue;
   const hk=input.hkex.get(m[1]);
   if(!hk){out.skipped.push('hkex_code_not_listed');continue;}
   const source=`hkex_${hk.file}`,locator=`${hk.file}:row:${hk.row}`;
   const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
   const k=`${keyOf(row)}|isin`;
   for(const b of proposals.get(k)?.list??[]){
    out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
     detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
    if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,written:sanitizeProvenance({isin:b.prov})});
   }
   proposals.set(k,{row,col:'isin',list:[{value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator}}]});
  }
 }

 // Stage C: TICKER → FIGI for rows that still have none.
 const hasFigi=(row:SecRow)=>row.figi!==null||proposals.has(`${keyOf(row)}|figi`)||figiClaimed.has(keyOf(row));
 if(stages.has('C')){
  for(const row of runRows){
   if(hasFigi(row))continue;
   const r=input.tickerResults.get(row.ticker);
   if(!r)continue;
   if(r.status!=='ok'){out.skipped.push(r.status==='not_found'?'figi_not_found':'openfigi_error');continue;}
   const g=groupFigiResults(r.records);
   out.skipped.push(...g.skipped);
   const c=g.candidates.find(x=>x.ticker===row.ticker);
   if(!c){out.skipped.push('figi_not_found');continue;}
   if(c.groups.length===1)propose(row,'figi',figiProposal(r,c.groups[0]));
   else multiFigi(row,r,c.groups);
  }
 }
 out.figiMissing=[...new Set(runRows.filter(r=>!hasFigi(r)&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();

 // Resolve proposals against the stored values.
 for(const {row,col,list} of proposals.values()){
  const current=row[col];
  if(list.length>1){
   out.skipped.push(`ambiguous_${col}`);
   for(const p of list){
    if(current===p.value)continue;
    const op:Op=current===null?'set_identifier':'correct_identifier';
    claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
     params:op==='set_identifier'?{}:{expected_current:current,new_value:p.value},evidence:p.evidence,written:sanitizeProvenance({[col]:p.prov})});
   }
   continue;
  }
  const p=list[0];
  const patch=sanitizeProvenance({[col]:p.prov});
  const write=(kind:SecurityWrite['kind'])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence});
  if(current===null){write('set');continue;}
  if(current===p.value){if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
  claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
   params:{expected_current:current,new_value:p.value},evidence:p.evidence,written:patch});
 }
 out.skipped.sort();
 return out;
}
