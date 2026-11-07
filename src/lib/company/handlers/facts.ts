// src/lib/company/handlers/facts.ts
// GET /api/companies/[ticker]/facts?concept=&periodStart=&periodEnd=&unit=&asOf= — the disclosure-history
// drawer series (spec §5.6, §0 #68): company_read_snapshot(history:true) narrowed to the natural key
// (concept, periodStart [INSTANT: = periodEnd], periodEnd, consolidated, unit), ascending by
// disclosure_seq. Each entry carries the transform chain (sourceConcept → concept, mappingVersion,
// mappingGen, unitRule from the evidence DTO); values gated; delta / relChange only between two
// adjacent ELIGIBLE entries so a withheld value never leaks through a difference. Facts of the same key in
// OTHER units are listed too (spec §5.3: "主单位以外的事实在抽屉列出"), gated the same way, in otherUnitSeries.
import {CONCEPT_IDS,MAPPING_GEN} from '@/lib/facts/concepts';
import {QueryError,dateParam} from '@/lib/facts/public-route';
import type {FactRow} from '@/lib/facts/types';
import {decimalRelChange,decimalSub} from '../decimal';
import {buildGated,countWithheld} from '../route';
import type {Handler} from '../route';
import type {EvidenceDto,FilingSummary,WithheldCounts,WithheldReason} from '../types';

export const FACTS_PARAMS=['concept','periodStart','periodEnd','unit','asOf'] as const;
const CONCEPTS=new Set(CONCEPT_IDS);
const UNIT_RE=/^[A-Za-z0-9_.:\/-]{1,32}$/;
interface SeriesBase{factId:string;availableDate:string;filingId:string;disclosureSeq:number|null;isCurrent:boolean|null;isRevision:boolean|null;sourceConcept:string;mappingVersion:string;mappingGen:number;unit:string}
export type SeriesEntry=(SeriesBase&{kind:'fact';value:string;rawHash:string;runId:string;unitRule:string|null;delta:string|null;relChange:string|null})|(SeriesBase&{kind:'withheld';reason:WithheldReason});
export interface FactSeriesDto{
 issuerId:string;ticker:string;market:'US'|'CN';asOf:string;mappingGen:number;stateRev:number;truncated:boolean;history:true;
 concept:string;periodStart:string;periodEnd:string;unit:string;otherUnits:string[];series:SeriesEntry[];
 /** Same natural key in other units (ascending, delta/relChange always null); feeds the drawer's other-units table. */
 otherUnitSeries:SeriesEntry[];
 filings:Record<string,FilingSummary>;evidence:Record<string,EvidenceDto>;withheld:WithheldCounts;
}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export const factsHandler:Handler=async(ctx)=>{
 const {params:p,issuer,deps,asOf}=ctx;
 const concept=p.get('concept');if(!concept||!CONCEPTS.has(concept))throw new QueryError('concept');
 const periodStart=dateParam(p,'periodStart');if(!periodStart)throw new QueryError('periodStart');
 const periodEnd=dateParam(p,'periodEnd');if(!periodEnd)throw new QueryError('periodEnd');
 const unit=p.get('unit');if(!unit||!UNIT_RE.test(unit))throw new QueryError('unit');
 const snap=await deps.snapshot(issuer.issuerId,issuer.market,{concepts:[concept],asOf,from:periodEnd,to:periodEnd,history:true});
 const head={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf,mappingGen:MAPPING_GEN,stateRev:snap.stateRev,truncated:snap.truncated,history:true as const,concept,periodStart,periodEnd,unit};
 if(snap.truncated){const body:FactSeriesDto={...head,otherUnits:[],series:[],otherUnitSeries:[],filings:{},evidence:{},withheld:{evidenceIncomplete:0,citationPending:0}};return {body,empty:true};}
 const sameKey=(r:FactRow)=>r.concept===concept&&r.consolidation==='consolidated'&&(r.period_start??r.period_end)===periodStart&&r.period_end===periodEnd;
 const seqOrder=(a:FactRow,b:FactRow)=>(a.disclosure_seq??0)-(b.disclosure_seq??0)||cmp(a.available_date,b.available_date)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
 const series=snap.rows.filter(r=>sameKey(r)&&r.unit===unit).sort(seqOrder);
 const others=snap.rows.filter(r=>sameKey(r)&&r.unit!==unit).sort((a,b)=>cmp(a.unit,b.unit)||seqOrder(a,b));
 const otherUnits=[...new Set(others.map(r=>r.unit))].sort(cmp);
 const g=await buildGated(ctx,[...series,...others].map(r=>r.fact_id),[...series,...others],snap.filings);
 const baseOf=(r:FactRow):SeriesBase=>({factId:r.fact_id,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??null,isRevision:r.is_revision??null,sourceConcept:r.source_concept,mappingVersion:r.mapping_version,mappingGen:r.mapping_gen,unit:r.unit});
 const entryOf=(r:FactRow,before:FactRow|null):SeriesEntry=>{
  const reason=g.reasonOf(r.fact_id);
  if(reason)return {...baseOf(r),kind:'withheld',reason};
  return {...baseOf(r),kind:'fact',value:r.value_text,rawHash:r.raw_hash,runId:r.run_id,unitRule:g.evidence[r.fact_id]?.unitRule??null,
   delta:before?decimalSub(r.value_text,before.value_text):null,relChange:before?decimalRelChange(before.value_text,r.value_text):null};
 };
 let prev:FactRow|null=null;
 const entries:SeriesEntry[]=series.map(r=>{const e=entryOf(r,prev);prev=e.kind==='fact'?r:null;return e;});
 const otherUnitSeries:SeriesEntry[]=others.map(r=>entryOf(r,null));
 const used=new Set([...series,...others].map(r=>r.filing_id));
 const body:FactSeriesDto={...head,otherUnits,series:entries,otherUnitSeries,filings:Object.fromEntries(snap.filings.filter(f=>used.has(f.filingId)).map(f=>[f.filingId,f])),evidence:g.evidence,withheld:countWithheld([...entries,...otherUnitSeries])};
 return {body,empty:entries.length===0};
};
