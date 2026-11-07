// Gold-set evaluation receipts and authorized, private extraction calls (spec §4.10, §11.3).
import {decimalEquals} from '../facts/json-numbers';
import {behaviorDigest} from './behavior';
import {BrokerError,conflict,gone,notFound} from './errors';
import {extractCandidates} from './extract/run';
import {canonicalJson,sha256Hex} from './hash';
import {processingAllowed,utcToday} from './licences';
import {LEASE_SECONDS,artifactLoader} from './parse';
import {brokerPaths} from './storage';
import {trackedUpload} from './tracked-write';
import {documentForAccess} from './upload';
import {EXTRACT_PROMPT_VERSION,SCHEMA_VERSION} from './versions';
import type {BrokerDeps} from './deps';
import type {DocumentRow,EvalFieldStats,EvalReceiptRow,LicenceRow,RunRow,ValueUnit} from './types';

export interface EvalRow{target_key:string|null;field:string;occurrence:number;value_text:string;value_num:string|null;value_currency:string|null;value_unit:ValueUnit|null;value_date:string|null;page:number|null;char_start:number|null;char_end:number|null}
export interface GoldDoc{sha256:string;fields:EvalRow[];absent:{target_key:string|null;field:string}[]}
export interface ExtractedDoc{sha256:string;rows:EvalRow[]}
export const EVAL_THRESHOLD=0.95,GOLD_MIN_DOCS=30;
const id=(r:{target_key:string|null;field:string;occurrence?:number})=>`${r.target_key??''}\u0000${r.field}\u0000${r.occurrence??1}`;
const tf=(r:{target_key:string|null;field:string})=>`${r.target_key??''}\u0000${r.field}`;
const norm=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();
const sameNum=(a:string|null,b:string|null)=>a===null||b===null?a===b:decimalEquals(a,b);
const sameValue=(a:EvalRow,b:EvalRow)=>{
 const typed=[a.value_num,a.value_currency,a.value_unit,a.value_date,b.value_num,b.value_currency,b.value_unit,b.value_date].some(v=>v!==null);
 if(!typed)return norm(a.value_text)===norm(b.value_text);
 return sameNum(a.value_num,b.value_num)&&a.value_currency===b.value_currency&&a.value_unit===b.value_unit&&a.value_date===b.value_date;
};
const overlaps=(a:EvalRow,b:EvalRow)=>a.char_start!==null&&a.char_end!==null&&b.char_start!==null&&b.char_end!==null&&a.char_start<b.char_end&&b.char_start<a.char_end;
const matches=(gold:EvalRow,x:EvalRow)=>sameValue(gold,x)&&gold.page===x.page&&overlaps(gold,x);
const ratio=(n:number,d:number)=>d===0?null:n/d;
export function evalStats(gold:GoldDoc[],extracted:ExtractedDoc[]):Pick<EvalReceiptRow,'n_docs'|'per_field'|'absence'|'precision_min'|'recall_min'|'passed'>{
 const per:Record<string,{tp:number;fp:number;fn:number}>={};const bump=(f:string,k:'tp'|'fp'|'fn')=>{(per[f]??={tp:0,fp:0,fn:0})[k]++;};
 const absence={tp:0,fp:0,fn:0};
 for(const gd of gold){
  const rows=extracted.find(e=>e.sha256===gd.sha256)?.rows??[];
  const byId=new Map<string,EvalRow[]>();for(const r of rows){const k=id(r);byId.set(k,[...(byId.get(k)??[]),r]);}
  const used=new Set<EvalRow>();
  for(const gr of gd.fields){const hit=(byId.get(id(gr))??[]).find(x=>!used.has(x)&&matches(gr,x));if(hit){used.add(hit);bump(gr.field,'tp');}else bump(gr.field,'fn');}
  for(const r of rows)if(!used.has(r))bump(r.field,'fp');
  const present=new Set(rows.map(tf));for(const a of gd.absent)present.has(tf(a))?absence.fp++:absence.tp++;
  for(const k of new Set(gd.fields.map(tf)))if(!present.has(k))absence.fn++;
 }
 const per_field:Record<string,EvalFieldStats>=Object.fromEntries(Object.entries(per).sort(([a],[b])=>a<b?-1:1).map(([f,c])=>[f,{...c,precision:ratio(c.tp,c.tp+c.fp),recall:ratio(c.tp,c.tp+c.fn)}]));
 const mins=(k:'precision'|'recall')=>{const v=Object.values(per_field).map(s=>s[k]).filter((x):x is number=>x!==null);return v.length?Math.min(...v):null;};
 const precision_min=mins('precision'),recall_min=mins('recall');
 return {n_docs:gold.length,per_field,absence,precision_min,recall_min,passed:precision_min!==null&&recall_min!==null&&precision_min>=EVAL_THRESHOLD&&recall_min>=EVAL_THRESHOLD};
}
export const corpusHash=(docs:GoldDoc[])=>sha256Hex(canonicalJson([...docs].sort((a,b)=>a.sha256<b.sha256?-1:a.sha256>b.sha256?1:0)));
export async function writeEvalReceipt(deps:Pick<BrokerDeps,'db'>,r:Omit<EvalReceiptRow,'receipt_id'|'ran_at'>):Promise<string>{
 if(r.corpus_kind==='gold'&&r.n_docs<GOLD_MIN_DOCS)console.warn(`[broker-research] gold receipt with ${r.n_docs} < ${GOLD_MIN_DOCS} docs will not lift blocker 13`);
 return deps.db.insertEvalReceipt(r);
}
export interface AuthorizedDoc{sha256:string;licence_id:string;licence_version:number;parse_run_id:string;artifact_hash:string|null;extractor_version:string|null}
export async function authorizeGoldDoc(deps:Pick<BrokerDeps,'db'|'now'>,sha256:string):Promise<{doc:DocumentRow;licence:LicenceRow;parseRun:RunRow}>{
 const found=await deps.db.findDocumentBySha(sha256);if(!found)throw notFound('document_not_found');
 const doc=await documentForAccess(deps,found.document_id);
 if(doc.status!=='parsed'||!doc.current_parse_run_id)throw conflict('document_not_parsed');
 const licence=await deps.db.getLicence(doc.licence_id);
 if(!licence||!processingAllowed(licence,utcToday(deps.now())))throw conflict('licence_forbids_processing');
 const parseRun=await deps.db.getRun(doc.current_parse_run_id);if(!parseRun||parseRun.status!=='succeeded')throw conflict('document_not_parsed');
 return {doc,licence,parseRun};
}
export const HEARTBEAT_MS=60_000;
export interface GoldEvalResult{receiptId:string|null;authorized:AuthorizedDoc[];corpusHash:string;behaviorDigest:string;approved:boolean;stats:ReturnType<typeof evalStats>|null}
export async function runGoldEval(deps:BrokerDeps,docs:GoldDoc[],o:{by:string;dryRun:boolean;deadlineMs?:number;log?:(line:string)=>void}):Promise<GoldEvalResult>{
 const seen=new Set<string>();
 for(const g of docs){
  if(!/^[0-9a-f]{64}$/.test(g.sha256)||seen.has(g.sha256)||!Array.isArray(g.fields)||!Array.isArray(g.absent))throw new BrokerError('invalid_gold_manifest',400);
  seen.add(g.sha256);
 }
 if(!docs.length)throw new BrokerError('invalid_gold_manifest',400);
 const info=deps.llm.info();if(!info)throw new BrokerError('llm_unavailable',503);
 const authorized:AuthorizedDoc[]=[];const versions=new Set<string>();
 for(const g of docs){const a=await authorizeGoldDoc(deps,g.sha256);authorized.push({sha256:g.sha256,licence_id:a.licence.licence_id,licence_version:a.licence.version,parse_run_id:a.parseRun.run_id,artifact_hash:a.parseRun.artifact_hash,extractor_version:a.parseRun.extractor_version});versions.add(a.parseRun.extractor_version??'unknown');}
 if(versions.size>1)throw conflict('mixed_extractor_versions',{versions:[...versions]});
 const extractorVersion=[...versions][0]??'unknown',hash=corpusHash(docs);
 const digest=behaviorDigest({extractorVersion,modelId:info.modelId,registryHash:info.registryHash,promptVersion:EXTRACT_PROMPT_VERSION,schemaVersion:SCHEMA_VERSION});
 const approved=(await deps.db.getSettings()).approved_gold_corpus_hash===hash;
 if(o.dryRun)return {receiptId:null,authorized,corpusHash:hash,behaviorDigest:digest,approved,stats:null};
 const load=artifactLoader(deps);const extracted:ExtractedDoc[]=[];
 for(const g of docs){
  const a=await authorizeGoldDoc(deps,g.sha256),pin=authorized.find(x=>x.sha256===g.sha256)!;
  if(a.licence.version!==pin.licence_version)throw conflict('licence_changed_during_eval');
  if(a.parseRun.run_id!==pin.parse_run_id||a.parseRun.artifact_hash!==pin.artifact_hash||a.parseRun.extractor_version!==pin.extractor_version)throw conflict('parse_run_changed_during_eval',{sha256:g.sha256});
  const token=deps.newId();if(!await deps.db.claimLease(a.doc.document_id,token,LEASE_SECONDS))throw conflict('lease_held',{sha256:g.sha256});
  try{
   let lost:'lease_lost'|'document_withdrawn'|null=null;
   const hb=setInterval(()=>{void deps.db.renewLease(a.doc.document_id,token,LEASE_SECONDS).then(x=>{if(x!=='ok')lost=x;},()=>{lost='lease_lost';});},HEARTBEAT_MS);
   let b:Awaited<ReturnType<typeof extractCandidates>>;
   try{b=await extractCandidates(deps.llm,info,await load(pin.parse_run_id),{deadline:new Date(deps.now().getTime()+(o.deadlineMs??600_000)),now:deps.now});}
   finally{clearInterval(hb);}
   if(lost==='document_withdrawn')throw gone();if(lost)throw conflict('lease_lost',{sha256:g.sha256});
   const evalRun=deps.newId();const put=(path:string,body:string)=>trackedUpload(deps,{documentId:a.doc.document_id,path,writer:'eval',body,contentType:'application/json',lease:{token,ttlSeconds:LEASE_SECONDS}});
   await put(brokerPaths.evalRequest(g.sha256,evalRun),JSON.stringify({run_id:evalRun,purpose:'eval-gold',sha256:g.sha256,licence_id:a.licence.licence_id,licence_version:a.licence.version,calls:b.requests}));
   await put(brokerPaths.evalResponse(g.sha256,evalRun),JSON.stringify({run_id:evalRun,calls:b.responses}));
   extracted.push({sha256:g.sha256,rows:b.rows});
   o.log?.(`${g.sha256.slice(0,12)} licence_v=${a.licence.version} candidates=${b.rows.length} unverified=${b.unverified} calls=${b.requests.length}`);
  }finally{await deps.db.fencedUpdateDocument(a.doc.document_id,token,{releaseLease:true});}
 }
 const stats=evalStats(docs,extracted);
 const receiptId=await writeEvalReceipt(deps,{corpus_kind:'gold',corpus_hash:hash,behavior_digest:digest,extractor_version:extractorVersion,model_id:info.modelId,registry_hash:info.registryHash,prompt_version:EXTRACT_PROMPT_VERSION,schema_version:SCHEMA_VERSION,code_version:deps.codeVersion,...stats,ran_by:o.by});
 return {receiptId,authorized,corpusHash:hash,behaviorDigest:digest,approved,stats};
}
