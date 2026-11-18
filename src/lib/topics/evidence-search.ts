// Topic plan T5.3: evidence lookup and separate public/admin projections.
import type {SupabaseClient} from '@supabase/supabase-js';
import {asOfFromDate,type EvidenceKind} from '@/lib/evidence/ref';
import type {Resolved,Resolver,ResolveState} from '@/lib/evidence/resolve';
import type {memorySources} from '@/lib/evidence/memory-sources';
import {productionSources} from '@/lib/evidence/production-sources';
import {formatSlot} from '@/lib/macro/strategy/explain-render';
import {selectAll,supabaseTableClient} from '@/lib/db/table-client';
import {supabaseFactsDb} from '@/lib/facts/db';
import {resolvePublicIssuer,UUID_RE} from '@/lib/facts/public-route';
import {supabaseIndustryDb} from '@/lib/industry/db';
import {SCHEME_VERSION} from '@/lib/industry/read';
import type {AggMetric} from '@/lib/industry/types';
import type {Bilingual,DraftBody,DraftRef} from './types';
import {TopicError} from './errors';
export type EvidenceQuery=
 |{kind:'macro_observation';series_id:string;period_end:string}
 |{kind:'financial_fact';ticker:string;concept:string;period_end:string}
 |{kind:'industry_metric';scheme:'sic'|'sw2021';code:string;metric:string;period_end:string}
 |{kind:'document_citation';document_id:string;page_no?:number}
 |{kind:'judgment';judgment_id:string};
export interface Candidate{ref:DraftRef;label:Bilingual;public:{state:ResolveState;reason:string|null;text:string|null};admin:{state:ResolveState;text:string|null;admin_only:boolean}}
export interface CandidateHit{ref:DraftRef;hint?:Bilingual}
export interface CandidateLookup{find(q:EvidenceQuery):Promise<CandidateHit[]>}
export interface EvidenceView{ordinal:number;kind:EvidenceKind;label:Bilingual;state:ResolveState;reason:string|null;text:string|null;period:string|null}
const bad=(field:string):never=>{throw new TopicError(`invalid_body:${field}`);};
export function parseEvidenceQuery(body:Record<string,unknown>):{query:EvidenceQuery;asOf:string|null}{
 const text=(field:string,re:RegExp):string=>{const v=body[field];return typeof v==='string'&&re.test(v)?v:bad(field);};
 const date=(field:string):string=>{
  const v=text(field,/^\d{4}-\d{2}-\d{2}$/),ms=Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===v?v:bad(field);
 };
 let query:EvidenceQuery;
 switch(body.kind){
  case 'macro_observation':query={kind:body.kind,series_id:text('series_id',/^[A-Z0-9_]{1,40}$/),period_end:date('period_end')};break;
  case 'financial_fact':query={kind:body.kind,ticker:text('ticker',/^\S{1,16}$/),concept:text('concept',/^[a-z_]{1,60}$/),period_end:date('period_end')};break;
  case 'industry_metric':{
   const scheme=body.scheme;if(scheme!=='sic'&&scheme!=='sw2021')return bad('scheme');
   query={kind:body.kind,scheme,code:text('code',/^[A-Za-z0-9.]{1,16}$/),metric:text('metric',/^[a-z_]{1,40}$/),period_end:date('period_end')};break;
  }
  case 'document_citation':{
   const document_id=text('document_id',UUID_RE).toLowerCase(),page=body.page_no;
   if(page!==undefined&&(typeof page!=='number'||!Number.isInteger(page)||page<1||page>9999))bad('page_no');
   query={kind:body.kind,document_id,...(page===undefined?{}:{page_no:page as number})};break;
  }
  case 'judgment':query={kind:body.kind,judgment_id:text('judgment_id',UUID_RE).toLowerCase()};break;
  default:throw new TopicError('invalid_parameter:kind');
 }
 return {query,asOf:body.as_of===undefined?null:asOfFromDate(date('as_of'))};
}
export function valueText(r:Resolved,locale:'zh'|'en'):string|null{
 if(r.state!=='ok'||!r.display.fact)return null;
 const slots=r.display.fact.slots;
 if(slots.value!==undefined)return typeof slots.value==='string'?slots.value:formatSlot(slots.value,locale);
 if(r.ref.kind==='document_citation'&&typeof slots.title==='string'&&typeof slots.page==='string')return `${slots.title} · p.${slots.page}`;
 if(r.ref.kind==='judgment'&&typeof slots.method==='string')return slots.method;
 return null;
}
export async function searchEvidence(d:{resolver:Resolver;lookup:CandidateLookup;now():Date},q:EvidenceQuery,asOf:string|null):Promise<Candidate[]>{
 const hits=(await d.lookup.find(q)).slice(0,20),now=d.now();
 const refs=hits.map(hit=>({...hit.ref,as_of:asOf??now.toISOString()}));
 const pub=await d.resolver.resolve(refs,{audience:'public',locale:'zh',now});
 const admin=await d.resolver.resolve(refs,{audience:'admin',locale:'zh',now});
 return hits.map((hit,i)=>{
  const p=pub.resolved[i],a=admin.resolved[i];
  const label=(locale:'zh'|'en')=>`${p.display.label[locale]||a.display.label[locale]}${hit.hint?.[locale]?` · ${hit.hint[locale]}`:''}`;
  const {as_of:unused,...ref}=hit.ref;void unused;
  return {ref:{...ref,...(asOf===null?{}:{as_of:asOf})},label:{zh:label('zh'),en:label('en')},
   public:{state:p.state,reason:p.reason,text:valueText(p,'zh')},
   admin:{state:a.state,text:valueText(a,'zh'),admin_only:a.admin_only===true||(a.state==='ok'&&p.state!=='ok')}};
 });
}
export async function draftEvidenceView(d:{resolver:Resolver;now():Date},body:DraftBody):Promise<EvidenceView[]>{
 const evidence=[...body.evidence].sort((a,b)=>a.ordinal-b.ordinal),now=d.now();
 const {resolved}=await d.resolver.resolve(evidence.map(e=>({...e.ref,as_of:e.ref.as_of??now.toISOString()})),{audience:'public',locale:'zh',now});
 return evidence.map((e,i)=>{
  const r=resolved[i];return {ordinal:e.ordinal,kind:e.ref.kind,label:r.display.label,state:r.state,reason:r.reason,text:valueText(r,'zh'),period:r.display.period};
 });
}
const hit=(kind:EvidenceKind,id:string,hint?:string):CandidateHit=>({ref:{v:1,kind,id},...(hint?{hint:{zh:hint,en:hint}}:{})});
const macroHits=async(s:Pick<ReturnType<typeof memorySources>,'macro'>,q:Extract<EvidenceQuery,{kind:'macro_observation'}>):Promise<CandidateHit[]>=>
 (await s.macro.versions(q.series_id,q.period_end)).map(r=>({...hit(q.kind,r.observation_id,`v${r.version}`),ref:{v:1,kind:q.kind,id:r.observation_id,locator:{series_id:q.series_id,period_end:q.period_end}}}));
export function memoryCandidateLookup(sources:ReturnType<typeof memorySources>):CandidateLookup{
 return {async find(q){
  const {seed}=sources;
  switch(q.kind){
   case 'macro_observation':return macroHits(sources,q);
   case 'financial_fact':return seed.facts.infos.filter(i=>i.issuer.ticker?.toLowerCase()===q.ticker.toLowerCase()&&i.row.concept===q.concept&&i.row.period_end===q.period_end)
    .map(({row})=>hit(q.kind,row.fact_id,`${row.duration} · ${row.available_date}`));
   case 'industry_metric':return seed.industry.cells.filter(c=>c.row!==null&&c.run.status==='active'&&c.run.scheme===q.scheme&&c.key.code===q.code&&c.key.metric===q.metric&&c.key.period_end===q.period_end)
    .map(c=>hit(q.kind,`${c.key.run_id}:${c.key.code}:${c.key.metric}:${c.key.period_start}:${c.key.period_end}`,`L${c.run.level}`));
   case 'document_citation':return seed.documents.citations.filter(c=>c.document_id===q.document_id&&(q.page_no===undefined||c.page_no===q.page_no)).map(c=>hit(q.kind,c.citation_id,`p.${c.page_no}`));
   case 'judgment':return [hit(q.kind,q.judgment_id)];
  }
 }};
}
export function productionCandidateLookup(clients:{admin:SupabaseClient}):CandidateLookup{
 const tables=supabaseTableClient(clients.admin),sources=productionSources(clients),facts=supabaseFactsDb(clients.admin),industry=supabaseIndustryDb(clients.admin);
 return {async find(q){
  switch(q.kind){
   case 'macro_observation':return macroHits(sources,q);
   case 'financial_fact':{
    const today=new Date().toISOString().slice(0,10),issuer=await resolvePublicIssuer(tables,q.ticker,today);if(!issuer)return [];
    const result=await facts.readFacts(issuer.issuerId,issuer.market,{concepts:[q.concept],from:q.period_end,to:q.period_end,asOf:today,history:true,includeNonOk:true});
    if(result.truncated)throw new Error('read_truncated');
    return result.rows.filter(r=>r.period_end===q.period_end&&r.concept===q.concept).map(r=>hit(q.kind,r.fact_id,`${r.duration} · ${r.available_date}`));
   }
   case 'industry_metric':{
    const version=SCHEME_VERSION[q.scheme],tree=await industry.classificationTree(q.scheme,version);
    const levels=[...new Set(tree.filter(n=>n.code===q.code).map(n=>n.level))].sort((a,b)=>a-b),out:CandidateHit[]=[];
    for(const level of levels){
     const run=await industry.activeMetricRun(q.scheme,version,level);if(!run)continue;
     const rows=await industry.metricRowsOfRun(run.run_id,{codes:[q.code],metrics:[q.metric as AggMetric],periodEnds:[q.period_end]});
     out.push(...rows.map(r=>hit(q.kind,`${run.run_id}:${r.code}:${r.metric}:${r.period_start}:${r.period_end}`,`L${level}`)));
    }
    return out;
   }
   case 'document_citation':return (await selectAll(tables,'document_citations',{document_id:q.document_id,...(q.page_no===undefined?{}:{page_no:q.page_no})},'citation_id'))
    .map(c=>hit(q.kind,String(c.citation_id),`p.${c.page_no}`));
   case 'judgment':return [hit(q.kind,q.judgment_id)];
  }
 }};
}
