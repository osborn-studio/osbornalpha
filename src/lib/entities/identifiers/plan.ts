// src/lib/entities/identifiers/plan.ts
// Pure planning of ISIN/FIGI writes (spec §4.1.2–§4.1.4). Inputs: the run's evidence (GLEIF subset,
// OpenFIGI job results by ISIN and by ticker, merged HKEX lists) and the current open security rows.
// Output: guarded column writes (one sanitized provenance key each), claim/1 claims, ownership
// quarantines and HKEX-vs-GLEIF text reconciliations. A stored value is never overwritten: a
// different value becomes correct_identifier. Several candidate values for one row/column are
// ambiguous and only produce claims. HK tickers found for an issuer that holds A shares are left
// to link-ah (spec §4.2.2 rule 1; contract issue 5). FIGI candidates are aggregated per target
// security across all results before any decision; HKEX-vs-GLEIF corrections are resolved against
// the ISIN actually stored (or filed by apply once the HKEX write lands).
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
 /** every evidence item behind the value (the primary one first); claims built from this write carry all of them */
 sources:ClaimEvidence[];
 /** claims that only make sense once this value is stored: apply files them when the write lands (written or duplicate) */
 followUps?:ClaimInput[];
}
export interface PlannedQuarantine{naturalKey:string;reasonCode:'ownership_conflict';detail:Record<string,unknown>;payload:Record<string,unknown>}
export interface PlannedRecon{naturalKey:string;passed:boolean;leftText:string;rightText:string;leftSource:string;rightSource:string;detail:Record<string,unknown>}
export interface AhCandidate{issuer_id:string;ticker:string;isin:string;evidence:ClaimEvidence}
export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}

interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>;sources?:ClaimEvidence[];after?:ClaimInput[]}
interface FigiEntry{row:SecRow;groups:Map<string,{g:FigiGroup;r:Extract<FigiJobResult,{status:'ok'}>}>}
type OkResult=Extract<FigiJobResult,{status:'ok'}>;
type Op=Exclude<ClaimOp,'legacy'>;
const keyOf=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
const targetOf=(r:SecRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from});
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};

export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
 const {asOf,stages}=input;
 const out:IdentifierPlan={writes:[],claims:[],quarantines:[],recons:[],duplicates:0,skipped:[],figiMissing:[],ahCandidates:[]};
 const runIds=new Set(input.issuers.map(i=>i.issuer_id));
 const runRows=input.openRows.filter(r=>runIds.has(r.issuer_id));
 const runRowByKey=new Map(runRows.map(r=>[`${r.issuer_id}|${r.ticker}`,r]));
 const openOwner=new Map(input.openRows.map(r=>[r.ticker,r.issuer_id]));
 const holdsA=new Set(input.openRows.filter(r=>/\.(SH|SZ)$/.test(r.ticker)).map(r=>r.issuer_id));
 const proposals=new Map<string,{row:SecRow;col:IdColumn;list:Proposal[]}>();
 const figiCands=new Map<string,FigiEntry>();
 const propose=(row:SecRow,col:IdColumn,p:Proposal)=>{
  const k=`${keyOf(row)}|${col}`;
  const e=proposals.get(k)??{row,col,list:[]};
  if(!e.list.some(x=>x.value===p.value))e.list.push(p);
  proposals.set(k,e);
 };
 const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];written?:Record<string,unknown>},into:ClaimInput[]=out.claims)=>{
  into.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:c.sources??[c.evidence],...(c.written?{provenance_written:c.written}:{}),
  }});
 };
 const openfigiEvidence=(r:OkResult):ClaimEvidence=>({source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`});
 const figiProposal=(r:OkResult,g:FigiGroup):Proposal=>({
  value:g.figi,source:'openfigi',kind:'provider_mapping',
  evidence:openfigiEvidence(r),
  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
 });
  // FIGI candidates are collected per target security across every result (all ISINs, stage C) and decided once,
 // so the order of ISIN iteration never changes the outcome (spec §4.1.2; Codex review P1).
 const addFigi=(row:SecRow,r:OkResult,groups:FigiGroup[])=>{
  const e=figiCands.get(keyOf(row))??{row,groups:new Map()};
  figiCands.set(keyOf(row),e);
  for(const g of groups){
   const old=e.groups.get(g.figi);
   if(!old||r.evidence.response_sha256<old.r.evidence.response_sha256)e.groups.set(g.figi,{g,r});
  }
 };
 const decideFigi=(e:FigiEntry)=>{
  const list=[...e.groups.values()].sort((x,y)=>x.g.figi<y.g.figi?-1:x.g.figi>y.g.figi?1:0);
  if(list.length===1){propose(e.row,'figi',figiProposal(list[0].r,list[0].g));return;}
  out.skipped.push('figi_multiple_groups');
  const note=`one of ${list.length} candidate FIGIs: ${list.map(x=>`${x.g.figi}(${x.g.level})`).join(', ')}`;
  const candidates=list.map(x=>({figi:x.g.figi,level:x.g.level}));
  for(const {g,r} of list){
   if(e.row.figi===g.figi){out.duplicates++;continue;}
   const p=figiProposal(r,g);
   const op:Op=e.row.figi===null?'set_identifier':'correct_identifier';
   claim({issuer_id:e.row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(e.row),
    params:op==='set_identifier'?{candidates}:{expected_current:e.row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
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
    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,sources:[evidence,openfigiEvidence(r)],prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
    for(const c of g.candidates){
     const own=runRowByKey.get(`${iss.issuer_id}|${c.ticker}`);
     if(own){
      propose(own,'isin',isinProposal);
      addFigi(own,r,c.groups);
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
   const hkProposal:Proposal={value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator},after:[]};
   for(const b of proposals.get(k)?.list??[]){
    out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
     detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
    // The GLEIF-side correction is only valid against the value actually stored: it assumes HKEX's value is (or becomes) stored.
    // Resolved below against the stored column (empty → filed by apply once the HKEX write lands; equal → filed now; else dropped).
    if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,sources:b.sources,written:sanitizeProvenance({isin:b.prov})},hkProposal.after!);
   }
   proposals.set(k,{row,col:'isin',list:[hkProposal]});
  }
 }

 // Stage C: TICKER → FIGI for rows that still have none.
 const hasFigi=(row:SecRow)=>row.figi!==null||figiCands.has(keyOf(row));
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
   addFigi(row,r,c.groups);
  }
 }
 for(const e of figiCands.values())decideFigi(e);
 out.figiMissing=[...new Set(runRows.filter(r=>r.figi===null&&!figiCands.has(keyOf(r))&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();

 // Resolve proposals against the stored values.
 for(const {row,col,list} of proposals.values()){
  const current=row[col];
  if(list.length>1){
   out.skipped.push(`ambiguous_${col}`);
   const candidates=list.map(p=>({[col]:p.value}));
   for(const p of list){
    if(current===p.value)continue;
    const op:Op=current===null?'set_identifier':'correct_identifier';
    claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
     params:op==='set_identifier'?{candidates}:{expected_current:current,new_value:p.value,candidates},evidence:p.evidence,sources:p.sources,written:sanitizeProvenance({[col]:p.prov})});
   }
   continue;
  }
  const p=list[0];
  const patch=sanitizeProvenance({[col]:p.prov});
  const write=(kind:SecurityWrite['kind'],followUps?:ClaimInput[])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence,sources:p.sources??[p.evidence],...(followUps?.length?{followUps}:{})});
  if(current===null){write('set',p.after);continue;}
  if(current===p.value){out.claims.push(...(p.after??[]));if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
  claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
   params:{expected_current:current,new_value:p.value},evidence:p.evidence,sources:p.sources,written:patch});
 }
 out.skipped.sort();
 return out;
}
