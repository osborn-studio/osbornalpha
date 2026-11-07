// src/lib/company/evidence-gate.ts
// The one evidence gate of the company module (spec §0 #62 #63, §5.6, §6.1). toEvidenceDto shapes an
// evidence-index record (company_fact_evidence) into the public DTO; evidenceEligible decides whether
// a value may be published: base evidence (record present and bound to the fact and its filing, the
// replay chain rawHash = sha256(sha + '\n' + hashLocator), code/tool/mapping versions) is never
// waived; US also needs pointer, stable download and the EDGAR index document; CN needs a linked
// cninfo filing with an https document URL and a per-value PDF locator bound to that document — the
// only part the admin variant waives. Every route that returns a financial value calls gateFacts and
// the consumer helpers below; an ineligible value never leaves the server (withheld, reason counted).
import {rawHashOf} from '@/lib/facts/providers/shared';
import {unitKindOf} from '@/lib/facts/units';
import type {FactRow,Market} from '@/lib/facts/types';
import type {PdfLocatorSource} from './pdf-locator';
import {EVIDENCE_INDEX_VERSION} from './types';
import type {Cell,CompanyDb,EventKind,EvidenceDto,EvidenceRecord,FilingSummary,PdfLocator,WithheldCounts,WithheldReason} from './types';

export type Eligibility={ok:true}|{ok:false;reason:WithheldReason};
export type GateFact=Pick<FactRow,'fact_id'|'raw_hash'|'unit'|'filing_id'|'run_id'>;
export const snapshotDownloadPath=(factId:string)=>`/api/companies/snapshot?fact=${encodeURIComponent(factId)}`;
const HEX64=/^[0-9a-f]{64}$/;
const httpsUrl=(u:string|null|undefined)=>{if(!u)return false;try{return new URL(u).protocol==='https:';}catch{return false;}};

export function toEvidenceDto(record:EvidenceRecord,fact:GateFact,filing:FilingSummary|null,pdf:PdfLocator|null):EvidenceDto{
 const kind=unitKindOf(fact.unit);
 const sourceDocument:EvidenceDto['sourceDocument']=record.source==='edgar'
  ?(filing?.url?{kind:'edgar_index',url:filing.url}:null)
  :(filing?.citation==='linked'&&filing.documentUrl?{kind:'cninfo_pdf',url:filing.documentUrl}:null);
 return {factId:record.fact_id,rawHash:record.raw_hash,
  snapshot:{source:record.source,sha256:record.snapshot_sha256,path:record.snapshot_path,api:record.api,url:record.url,params:record.params,capturedAt:record.captured_at,httpStatus:record.http_status,page:record.page,download:record.source==='edgar'?snapshotDownloadPath(record.fact_id):null},
  locator:{hashLocator:record.hash_locator,jsonPointer:record.json_pointer,field:record.field,pdf},
  run:{runId:record.run_id,codeVersion:record.code_version,toolVersions:record.tool_versions},
  mappingVersion:record.mapping_version,unitRule:kind?`unit_${kind}`:null,sourceDocument};
}

const nonBlank=(v:unknown)=>typeof v==='string'&&v.trim()!=='';
const validPdfLocator=(p:PdfLocator)=>Number.isInteger(p.page)&&p.page>=1&&nonBlank(p.row)&&nonBlank(p.column)&&(p.table===null||nonBlank(p.table));
const NO=(reason:WithheldReason):Eligibility=>({ok:false,reason});
export function evidenceEligible(dto:EvidenceDto|null,fact:GateFact,filing:FilingSummary|null,market:Market,opts:{admin:boolean}):Eligibility{
 if(!dto||dto.factId!==fact.fact_id||!filing||filing.filingId!==fact.filing_id||dto.rawHash!==fact.raw_hash)return NO('evidence_incomplete');
 if(!HEX64.test(dto.snapshot.sha256)||!dto.locator.hashLocator||rawHashOf(dto.snapshot.sha256,dto.locator.hashLocator)!==dto.rawHash)return NO('evidence_incomplete');
 if(dto.snapshot.source!==(market==='US'?'edgar':'tushare'))return NO('evidence_incomplete');
 if(!dto.run.codeVersion||dto.run.toolVersions===null||!dto.mappingVersion)return NO('evidence_incomplete');
 if(market==='US'){
  if(!dto.locator.jsonPointer||!dto.snapshot.download||dto.sourceDocument?.kind!=='edgar_index'||!dto.sourceDocument.url)return NO('evidence_incomplete');
  return {ok:true};
 }
 if(opts.admin)return {ok:true};
 const pdf=dto.locator.pdf;
 if(filing.citation!=='linked'||!httpsUrl(filing.documentUrl)||!pdf||pdf.documentUrl!==filing.documentUrl||!validPdfLocator(pdf))return NO('citation_pending');
 return {ok:true};
}

export interface GateInput{factIds:Iterable<string>;facts:Map<string,GateFact>;filings:Map<string,FilingSummary>;records:Map<string,EvidenceRecord>;pdf:Map<string,PdfLocator>;market:Market;admin:boolean}
export interface GateResult{evidence:Record<string,EvidenceDto>;eligibility:Map<string,Eligibility>;withheld:WithheldCounts}
export function applyGate(input:GateInput):GateResult{
 const evidence:Record<string,EvidenceDto>={};const eligibility=new Map<string,Eligibility>();const withheld:WithheldCounts={evidenceIncomplete:0,citationPending:0};
 for(const id of [...new Set(input.factIds)].sort()){
  const fact=input.facts.get(id);
  let e:Eligibility;let dto:EvidenceDto|null=null;
  if(!fact)e=NO('evidence_incomplete');
  else{
   const rec=input.records.get(id);const filing=input.filings.get(fact.filing_id)??null;
   dto=rec&&rec.index_version===EVIDENCE_INDEX_VERSION?toEvidenceDto(rec,fact,filing,input.pdf.get(id)??null):null;
   e=evidenceEligible(dto,fact,filing,input.market,{admin:input.admin});
  }
  eligibility.set(id,e);
  if(e.ok&&dto)evidence[id]=dto;
  else if(!e.ok){if(e.reason==='evidence_incomplete')withheld.evidenceIncomplete++;else withheld.citationPending++;}
 }
 return {evidence,eligibility,withheld};
}
export interface GateDeps{db:Pick<CompanyDb,'evidenceOf'>;pdf:PdfLocatorSource}
export async function gateFacts(deps:GateDeps,input:{issuerId:string;market:Market;admin:boolean;factIds:Iterable<string>;facts:Map<string,GateFact>;filings:Map<string,FilingSummary>}):Promise<GateResult>{
 const ids=[...new Set(input.factIds)].sort();
 if(ids.length===0)return {evidence:{},eligibility:new Map(),withheld:{evidenceIncomplete:0,citationPending:0}};
 const records=await deps.db.evidenceOf(ids);
 const pdf=input.market==='CN'?await deps.pdf.locate(input.issuerId,input.market,ids):new Map<string,PdfLocator>();
 return applyGate({factIds:ids,facts:input.facts,filings:input.filings,records,pdf,market:input.market,admin:input.admin});
}

// ---- consumer helpers ----
const reasonOf=(e:Eligibility|undefined):WithheldReason|null=>e?.ok?null:e?e.reason:'evidence_incomplete';
const worst=(rs:WithheldReason[])=>rs.includes('evidence_incomplete')?'evidence_incomplete' as const:'citation_pending' as const;
export function gateCell(cell:Cell,elig:Map<string,Eligibility>):Cell{
 if(cell===null||cell.kind==='withheld')return cell;
 if(cell.kind==='fact'){const r=reasonOf(elig.get(cell.factId));return r===null?cell:{kind:'withheld',reason:r,factId:cell.factId};}
 if(cell.inputs.length===0)return {kind:'withheld',reason:'evidence_incomplete',factId:''};
 const bad=cell.inputs.map(i=>({id:i.factId,r:reasonOf(elig.get(i.factId))})).filter((x):x is {id:string;r:WithheldReason}=>x.r!==null);
 return bad.length===0?cell:{kind:'withheld',reason:worst(bad.map(b=>b.r)),factId:bad[0].id};
}
export function metricWithheldReason(inputs:{fact_id:string}[],elig:Map<string,Eligibility>):WithheldReason|null{
 if(inputs.length===0)return 'evidence_incomplete';
 const rs=inputs.map(i=>reasonOf(elig.get(i.fact_id))).filter((r):r is WithheldReason=>r!==null);
 return rs.length===0?null:worst(rs);
}
type Point={factId:string;value:unknown;[k:string]:unknown};
export function eventFactIds(ev:{kind:EventKind;payload:Record<string,unknown>}):string[]{
 if(ev.kind==='period_first_seen')return Object.values((ev.payload.headline??{}) as Record<string,Point>).map(h=>h.factId);
 if(ev.kind==='fact_revised')return [(ev.payload.from as Point).factId,(ev.payload.to as Point).factId];
 return [];
}
export function gateEventPayload(ev:{kind:EventKind;payload:Record<string,unknown>},elig:Map<string,Eligibility>):Record<string,unknown>{
 if(ev.kind==='period_first_seen'){
  const headline=Object.fromEntries(Object.entries((ev.payload.headline??{}) as Record<string,Point>).map(([c,h])=>{const r=reasonOf(elig.get(h.factId));return [c,r===null?h:{...h,value:{kind:'withheld',reason:r,factId:h.factId}}];}));
  return {...ev.payload,headline};
 }
 if(ev.kind==='fact_revised'){
  const from=ev.payload.from as Point,to=ev.payload.to as Point;
  const rf=reasonOf(elig.get(from.factId)),rt=reasonOf(elig.get(to.factId));
  if(rf===null&&rt===null)return ev.payload;
  const out:Record<string,unknown>={...ev.payload,
   from:rf===null?from:{...from,value:{kind:'withheld',reason:rf,factId:from.factId}},
   to:rt===null?to:{...to,value:{kind:'withheld',reason:rt,factId:to.factId}}};
  if('relChange' in ev.payload)out.relChange={kind:'withheld',reason:worst([rf,rt].filter((r):r is WithheldReason=>r!==null))};
  return out;
 }
 if(ev.kind==='filing_published')return ev.payload;
 throw new Error(`unknown_event_kind`);
}
