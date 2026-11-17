// src/lib/evidence/ref.ts
// evidence-ref/1 (topic spec 2026-11-16 §4.1). A new kind is a new contract version, never an edit here.
import {canonicalJson,sha256Hex} from './hash';
export const CONTRACT_VERSION='evidence-ref/1';
export const EVIDENCE_KINDS=['macro_observation','industry_metric','financial_fact','document_citation','broker_report_meta','judgment'] as const;
export type EvidenceKind=typeof EVIDENCE_KINDS[number];
export interface EvidenceRef{v:1;kind:EvidenceKind;id:string;as_of:string;locator?:Record<string,string>}
export class EvidenceRefError extends Error{constructor(readonly code:string){super(code);this.name='EvidenceRefError';}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const INDUSTRY_ID=/^([0-9a-f-]{36}):([A-Za-z0-9.]{1,16}):([a-z_]{1,40}):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;
const ALLOWED=new Set(['v','kind','id','as_of','locator']);
export const asOfFromDate=(d:string):string=>{if(!DATE.test(d))throw new EvidenceRefError('invalid_ref:as_of');return `${d}T23:59:59.999Z`;};
export function parseIndustryId(id:string):{run_id:string;code:string;metric:string;period_start:string;period_end:string}|null{
 const m=INDUSTRY_ID.exec(id);return m&&UUID.test(m[1])?{run_id:m[1],code:m[2],metric:m[3],period_start:m[4],period_end:m[5]}:null;
}
export function parseRef(raw:unknown):EvidenceRef{
 const bad=(f:string)=>new EvidenceRefError(`invalid_ref:${f}`);
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))throw bad('shape');
 const r=raw as Record<string,unknown>;
 for(const k of Object.keys(r))if(!ALLOWED.has(k))throw bad(k);
 if(r.v!==1)throw bad('v');
 if(typeof r.kind!=='string'||!(EVIDENCE_KINDS as readonly string[]).includes(r.kind))throw bad('kind');
 const kind=r.kind as EvidenceKind;
 if(typeof r.id!=='string'||!(kind==='industry_metric'?parseIndustryId(r.id):UUID.test(r.id)))throw bad('id');
 const t=typeof r.as_of==='string'?Date.parse(r.as_of):NaN;
 if(!Number.isFinite(t)||!/^\d{4}-\d{2}-\d{2}T/.test(r.as_of as string))throw bad('as_of');
 let locator:Record<string,string>|undefined;
 if(r.locator!==undefined){
  if(r.locator===null||typeof r.locator!=='object'||Array.isArray(r.locator)||Object.values(r.locator).some(v=>typeof v!=='string'))throw bad('locator');
  locator=r.locator as Record<string,string>;
 }
 return {v:1,kind,id:r.id,as_of:new Date(t).toISOString(),...(locator?{locator}:{})};
}
export const canonicalRef=(ref:EvidenceRef):{v:1;kind:EvidenceKind;id:string;as_of:string}=>({v:1,kind:ref.kind,id:ref.id,as_of:new Date(ref.as_of).toISOString()});
export const refHash=(ref:EvidenceRef):string=>sha256Hex(canonicalJson(canonicalRef(ref)));
