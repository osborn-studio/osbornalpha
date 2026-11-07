// src/lib/company/memory-company-db.ts
// In-memory CompanyDb for unit tests (spec §4.6, §4.7, §0 #64 #70, §0.1 item 2). It reproduces the SQL
// functions' rules so digest/route unit tests see database behaviour: stream existence and state_rev
// from the injected memoryFactsDb (stale_computation), attempt ownership (stale_attempt, §0 #70 failure
// watermark, 1h·2^n backoff capped at 24h), the per-kind event schema and fact/filing visibility (the
// same detail texts as company_ev_check), server-computed event_id/payload_hash (canonical.ts),
// tombstones, revival, first_seen_at preservation, payload_changed_at only on a hash change, the
// evidence-row checks and whitelist, the 200-watch cap, receipt checks and cascade. Inputs pass through
// JSON first (what PostgREST would send). A call is validated completely before anything is written
// (SQL: one transaction). Every method runs through one promise chain per instance (serialised).
// registerBatch / registerIssuer stand in for ingest_batches / issuers.
import {numericEquals} from '../facts/memory-facts-db';
import type {MemoryFactsDb} from '../facts/memory-facts-db';
import type {FactRow,FilingRow,ScopeRow} from '../facts/types';
import {compareCodePoints,eventIdOf,payloadHashOf,sha256Utf8} from './canonical';
import {MAX_COMPANY_WATCHES,MAX_COVERAGE_PAGE,checkEventIds,checkEventsQuery,decodeInboxCursor,decodeIssuerCursor,inboxPage,issuerPage,sortCoverage,tsKey,watchPatch} from './db';
import {CompanyDbError} from './types';
import type {CompanyDb,CoverageInput,CoverageRow,DigestStateRow,EventInput,EventRow,EvidenceIndexRow,EvidenceRecord,Market,WatchRow} from './types';

export interface MemoryBatch{producer:string;status:'running'|'success'|'partial'|'failed'|'rejected';code_version:string|null;tool_versions:Record<string,unknown>}
export interface MemoryCompanyDb extends CompanyDb{
 /** Fixes "now" (first_seen_at, rebuilt_at, "today"); null returns to the wall clock. */
 setNow(iso:string|null):void;
 registerBatch(id:string,b?:Partial<MemoryBatch>):void;
 registerIssuer(id:string,name:string):void;
 events():EventRow[];coverage():CoverageRow[];states():DigestStateRow[];watches():WatchRow[];
}

const ASYNC_METHODS=['digestDue','sweepDue','beginAttempt','replaceDigest','markDigestFailed','backlog','digestState','replaceEvidence','eventsOfIssuer','eventsOfIssuers','evidenceOf',
 'coverageOf','listCoverage','watchesOf','upsertWatch','patchWatch','deleteWatch','markRead','readEventIds'] as const satisfies readonly (keyof CompanyDb)[];
/** Compile-time check: ASYNC_METHODS must cover every CompanyDb method. */
export type AsyncMethodsComplete=[Exclude<keyof CompanyDb,typeof ASYNC_METHODS[number]>] extends [never]?true:never;
export const asyncMethodsComplete:AsyncMethodsComplete=true;

const EPOCH='1970-01-01T00:00:00.000Z';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const HEADLINE=['revenue','revenue_operating','net_income_parent','operating_cash_flow'];
const DURATIONS=['3M','6M','9M','12M','INSTANT'];
const EVENT_KEYS=['kind','natural_key','occurred_on','period_end','concept','filing_id','payload','meta'];
const COVERAGE_KEYS=['filings_count','facts_count','concepts_covered','earliest_period_end','latest_period_end','latest_available_date','citation_summary','scope_last_success_at','scope_last_status'];
const EVIDENCE_KEYS=['fact_id','raw_hash','snapshot_sha256','snapshot_path','hash_locator','json_pointer','field','source','api','url','params','captured_at','http_status','page','index_version'];
const REL=/^-?[0-9]+(\.[0-9]+)?$/;
const sk=(a:string,b:string)=>`${a}|${b}`;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const chars=(s:string)=>[...s].length;
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const internal=(m:string)=>new CompanyDbError('internal',m);
const noStream=()=>new CompanyDbError('unknown_stream','unknown_stream');
function ev(detail:string):never{throw new CompanyDbError('invalid_event',`invalid_event: ${detail}`);}
function evd(detail:string):never{throw new CompanyDbError('invalid_evidence',`invalid_evidence: ${detail}`);}

// ---------------------------------------------------------------- the company_ev_* helpers, in TypeScript
function keysOf(p:unknown,req:string[],opt:string[],what:string):Record<string,unknown>{
 if(!isObj(p))ev(`${what}: object expected`);
 if(Object.keys(p).some(k=>!req.includes(k)&&!opt.includes(k)))ev(`${what}: unexpected key`);
 if(req.some(k=>!(k in p)))ev(`${what}: missing key`);
 return p;
}
function text(v:unknown,nullable:boolean,what:string):string|null{
 if(v===null||v===undefined){if(nullable)return null;ev(`${what}: required`);}
 if(typeof v!=='string'||chars(v)<1||chars(v)>256)ev(`${what}: string of 1..256 characters expected`);
 return v;
}
const textReq=(v:unknown,what:string)=>text(v,false,what) as string;
function date(v:unknown,nullable:boolean,what:string):string|null{
 if(v===null||v===undefined){if(nullable)return null;ev(`${what}: required`);}
 const d=typeof v==='string'&&DATE.test(v)?new Date(`${v}T00:00:00.000Z`):null;
 if(d===null||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v)ev(`${what}: date YYYY-MM-DD expected`);
 return v as string;
}
const dateReq=(v:unknown,what:string)=>date(v,false,what) as string;
function int(v:unknown,nullable:boolean,min:number,what:string):number|null{
 if(v===null||v===undefined){if(nullable)return null;ev(`${what}: required`);}
 if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>2147483647)ev(`${what}: integer >= ${min} expected`);
 return v;
}
function uuid(v:unknown,nullable:boolean,what:string):string|null{
 if(v===null||v===undefined){if(nullable)return null;ev(`${what}: required`);}
 if(typeof v!=='string'||!UUID.test(v))ev(`${what}: uuid (lowercase canonical form) expected`);
 return v;
}
interface Ctx{issuer:string;market:Market;today:string;facts:FactRow[];filings:Map<string,FilingRow>}
function visibleFact(x:Ctx,ref:unknown,what:string):FactRow{
 const id=uuid(ref,false,what);
 const f=x.facts.find(r=>r.fact_id===id&&r.issuer_id===x.issuer&&r.market===x.market&&r.status==='ok'&&r.available_date<=x.today&&x.filings.get(r.filing_id)?.mapping_gen===r.mapping_gen);
 if(!f)ev(`${what}: fact not visible in this stream (ok, current generation, available by today)`);
 return f;
}
function visibleFiling(x:Ctx,ref:unknown,what:string):FilingRow{
 const id=uuid(ref,false,what);const g=id===null?undefined:x.filings.get(id);
 if(!g||g.issuer_id!==x.issuer||g.market!==x.market||g.mapping_gen<=0||g.available_date>x.today)ev(`${what}: filing not in this stream (active generation, available by today)`);
 return g;
}
function side(x:Ctx,p:unknown,what:string):FactRow{
 const o=keysOf(p,['factId','value','filingId','availableDate'],[],what);
 const f=visibleFact(x,o.factId,`${what}.factId`);
 if(textReq(o.value,`${what}.value`)!==f.value_text||uuid(o.filingId,false,`${what}.filingId`)!==f.filing_id||dateReq(o.availableDate,`${what}.availableDate`)!==f.available_date)
  ev(`${what}: value differs from value_text, or filingId/availableDate differ from the fact`);
 return f;
}
const startOf=(f:FactRow)=>f.period_start??f.period_end;
function checkEvent(x:Ctx,e:unknown):void{
 const o=keysOf(e,EVENT_KEYS,[],'event');
 const kind=textReq(o.kind,'kind');const nk=textReq(o.natural_key,'natural_key');const occ=dateReq(o.occurred_on,'occurred_on');
 const pend=date(o.period_end,true,'period_end');const concept=text(o.concept,true,'concept');const filing=uuid(o.filing_id,true,'filing_id');
 if(occ>x.today)ev('occurred_on: after today');
 if(kind==='filing_published'){
  const p=keysOf(o.payload,['formType','fiscalYear','fiscalPeriod','periodEnd','availableDate','sourceRef','factCount'],[],'payload');
  keysOf(o.meta,[],[],'meta');
  const g=visibleFiling(x,o.filing_id,'filing_id');
  if(nk!==g.filing_id||occ!==g.available_date||pend!==g.period_end||concept!==null)ev('filing_published: natural_key/occurred_on/period_end/concept must be filing_id/available_date/period_end/null');
  if(textReq(p.formType,'payload.formType')!==g.form_type||int(p.fiscalYear,true,0,'payload.fiscalYear')!==g.fiscal_year||text(p.fiscalPeriod,true,'payload.fiscalPeriod')!==g.fiscal_period
   ||date(p.periodEnd,true,'payload.periodEnd')!==g.period_end||dateReq(p.availableDate,'payload.availableDate')!==g.available_date||textReq(p.sourceRef,'payload.sourceRef')!==g.source_ref)
   ev('filing_published: payload differs from the filing');
  const n=x.facts.filter(f=>f.filing_id===g.filing_id&&f.status==='ok'&&f.mapping_gen===g.mapping_gen).length;
  if(int(p.factCount,false,0,'payload.factCount')!==n)ev('payload.factCount: differs from the visible facts of the filing');
 }else if(kind==='period_first_seen'){
  const p=keysOf(o.payload,['periodStart','periodEnd','duration','filingId','conceptCount','headline','ambiguousUnits'],[],'payload');
  const m=keysOf(o.meta,['headlineAsOf'],[],'meta');
  const s=dateReq(p.periodStart,'payload.periodStart');const pe=dateReq(p.periodEnd,'payload.periodEnd');const dur=textReq(p.duration,'payload.duration');
  if(!DURATIONS.includes(dur)||(dur==='INSTANT')!==(s===pe)||s>pe)ev('payload.duration: 3M/6M/9M/12M/INSTANT with periodStart = periodEnd exactly for INSTANT');
  if(nk!==`${s}:${pe}:${dur}`||pend!==pe||concept!==null)ev('period_first_seen: natural_key/period_end/concept must be periodStart:periodEnd:duration/periodEnd/null');
  const g=visibleFiling(x,p.filingId,'payload.filingId');
  if(filing!==g.filing_id||occ!==g.available_date)ev('period_first_seen: filing_id/occurred_on must be payload.filingId and its available_date');
  int(p.conceptCount,false,1,'payload.conceptCount');
  if(dateReq(m.headlineAsOf,'meta.headlineAsOf')>x.today)ev('meta.headlineAsOf: after today');
  const hl=keysOf(p.headline,[],HEADLINE,'payload.headline');
  for(const [k,v] of Object.entries(hl)){
   const h=keysOf(v,['factId','value','unit'],[],`payload.headline.${k}`);
   const f=visibleFact(x,h.factId,`payload.headline.${k}.factId`);
   if(f.concept!==k||f.value_text!==textReq(h.value,`payload.headline.${k}.value`)||f.unit!==textReq(h.unit,`payload.headline.${k}.unit`)
    ||startOf(f)!==s||f.period_end!==pe||f.duration!==dur||f.consolidation!=='consolidated')
    ev(`payload.headline.${k}: value differs from value_text, or the fact is not this concept and period`);
  }
  const amb=p.ambiguousUnits;
  if(!Array.isArray(amb)||amb.some(u=>typeof u!=='string'||!HEADLINE.includes(u)||u in hl)||new Set(amb).size!==amb.length)
   ev('payload.ambiguousUnits: distinct headline concepts absent from headline expected');
 }else if(kind==='fact_revised'){
  const p=keysOf(o.payload,['concept','statement','periodStart','periodEnd','duration','consolidation','unit','from','to'],['relChange'],'payload');
  keysOf(o.meta,[],[],'meta');
  const f=side(x,p.from,'payload.from');const t=side(x,p.to,'payload.to');
  const s=dateReq(p.periodStart,'payload.periodStart');const pe=dateReq(p.periodEnd,'payload.periodEnd');const dur=textReq(p.duration,'payload.duration');
  if(f.fact_id===t.fact_id||f.available_date>t.available_date||numericEquals(f.value_text,t.value_text))ev('payload.from/to: not a revision (distinct facts, from no later than to, different values)');
  if(textReq(p.concept,'payload.concept')!==t.concept||f.concept!==t.concept||textReq(p.statement,'payload.statement')!==t.statement||f.statement!==t.statement
   ||s!==startOf(t)||s!==startOf(f)||pe!==t.period_end||pe!==f.period_end||dur!==t.duration||dur!==f.duration
   ||textReq(p.consolidation,'payload.consolidation')!=='consolidated'||t.consolidation!=='consolidated'||f.consolidation!=='consolidated'
   ||textReq(p.unit,'payload.unit')!==t.unit||f.unit!==t.unit)
   ev('payload: from/to and the payload are not one natural key');
  if(nk!==`${t.concept}:${s}:${pe}:consolidated:${t.unit}:${t.available_date}`||occ!==t.available_date||pend!==pe||concept!==t.concept||filing!==t.filing_id)
   ev('fact_revised: natural_key/occurred_on/period_end/concept/filing_id must follow the to side');
  const has='relChange' in p;
  if(has===numericEquals(f.value_text,'0')||(has&&!REL.test(textReq(p.relChange,'payload.relChange'))))
   ev('payload.relChange: present exactly when from is non-zero, as a plain decimal');
 }else ev('kind: unknown event kind');
}
function checkCoverage(v:unknown):CoverageInput{
 const p=keysOf(v,COVERAGE_KEYS,[],'coverage');
 for(const k of ['filings_count','facts_count','concepts_covered'])int(p[k],false,0,`coverage.${k}`);
 for(const k of ['earliest_period_end','latest_period_end','latest_available_date'])date(p[k],true,`coverage.${k}`);
 const c=keysOf(p.citation_summary,['linked','pending','edgar'],[],'coverage.citation_summary');
 for(const k of ['linked','pending','edgar'])int(c[k],false,0,`coverage.citation_summary.${k}`);
 const st=text(p.scope_last_status,true,'coverage.scope_last_status');
 if(st!==null&&st!=='success'&&st!=='failed')ev('coverage.scope_last_status: success, failed or null expected');
 const ts=p.scope_last_success_at;
 if(ts!==null&&!isoWithZone(ts))ev('coverage.scope_last_success_at: timestamp or null expected');
 return p as unknown as CoverageInput;
}
/** A key containing 'token' (case-insensitive) at any depth of params, arrays included. */
function hasTokenKey(v:unknown):boolean{
 if(Array.isArray(v))return v.some(hasTokenKey);
 if(!isObj(v))return false;
 return Object.entries(v).some(([k,x])=>/token/i.test(k)||hasTokenKey(x));
}
const ISO_TS=/^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$/;
/** ISO timestamp with a zone whose calendar date round-trips (2024-02-30 is refused, as the timestamptz cast does). */
const isoWithZone=(v:unknown):boolean=>{
 if(typeof v!=='string'||!ISO_TS.test(v)||Number.isNaN(Date.parse(v)))return false;
 const d=new Date(`${v.slice(0,10)}T00:00:00.000Z`);
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v.slice(0,10);
};
function checkEvidence(x:Ctx,r:unknown):void{
 if(!isObj(r)||Object.keys(r).some(k=>!EVIDENCE_KEYS.includes(k))||EVIDENCE_KEYS.some(k=>!(k in r)))evd('row: exactly the EvidenceIndexRow keys expected');
 if(typeof r.fact_id!=='string'||!UUID.test(r.fact_id))evd('fact_id: uuid expected');
 const f=x.facts.find(z=>z.fact_id===r.fact_id&&z.issuer_id===x.issuer&&z.market===x.market);
 if(!f)evd('fact_id: not a fact of this stream');
 const src=x.filings.get(f.filing_id)?.source;
 const sha=r.snapshot_sha256;const loc=r.hash_locator;
 if(typeof sha!=='string'||!/^[0-9a-f]{64}$/.test(sha))evd('snapshot_sha256: 64 lowercase hex expected');
 if(typeof loc!=='string'||chars(loc)<1||chars(loc)>1024)evd('hash_locator: string of 1..1024 characters expected');
 if(typeof r.raw_hash!=='string'||r.raw_hash!==f.raw_hash)evd('raw_hash: differs from the fact');
 if(f.raw_hash!==sha256Utf8(`${sha}\n${loc}`))evd('raw_hash: not sha256(snapshot_sha256 \\n hash_locator)');
 if(typeof r.source!=='string'||r.source!==src)evd('source: differs from the filing');
 if(r.snapshot_path!==`${src}/${x.issuer}/${sha}.json`)evd('snapshot_path: <source>/<issuer_id>/<snapshot_sha256>.json expected');
 if(typeof r.json_pointer!=='string'||!r.json_pointer.startsWith('/')||chars(r.json_pointer)>1024)evd('json_pointer: JSON pointer expected');
 const optStr=(v:unknown,max:number)=>v===null||(typeof v==='string'&&chars(v)>=1&&chars(v)<=max);
 if(!optStr(r.field,64))evd('field: null or string of 1..64 characters expected');
 if(!optStr(r.api,64))evd('api: null or string of 1..64 characters expected');
 if(!optStr(r.url,2048))evd('url: null or string of 1..2048 characters expected');
 if(r.params!==null&&!isObj(r.params))evd('params: null or object expected');
 if(hasTokenKey(r.params))evd('params: must not carry a token');
 if(r.captured_at!==null&&!isoWithZone(r.captured_at))evd('captured_at: timestamp or null expected');
 const optInt=(v:unknown,min:number,max:number)=>v===null||(typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max);
 if(!optInt(r.http_status,100,599))evd('http_status: integer 100..599 or null expected');
 if(!optInt(r.page,0,2147483647))evd('page: non-negative integer or null expected');
 if(typeof r.index_version!=='string'||chars(r.index_version)<1||chars(r.index_version)>64)evd('index_version: string of 1..64 characters expected');
}

export function memoryCompanyDb(opts:{facts:MemoryFactsDb}):MemoryCompanyDb{
 const facts=opts.facts;
 const events=new Map<string,EventRow>();
 const coverage=new Map<string,CoverageRow>();
 const states=new Map<string,DigestStateRow>();
 const evidence=new Map<string,EvidenceIndexRow&{issuer_id:string;market:Market}>();
 const watches=new Map<string,WatchRow>();
 const reads=new Map<string,{user_id:string;issuer_id:string;event_id:string;read_at:string}>();
 const batches=new Map<string,MemoryBatch>();
 const names=new Map<string,string>();
 let fixedNow:string|null=null;
 const now=()=>fixedNow??new Date().toISOString();
 const scopeOf=(i:string,m:Market):ScopeRow|undefined=>facts.scope().find(s=>s.issuer_id===i&&s.market===m);
 const ctx=(issuer:string,market:Market):Ctx=>({issuer,market,today:now().slice(0,10),facts:facts.facts(),filings:new Map(facts.filings().map(g=>[g.filing_id,g]))});
 const streamEvents=(i:string,m:Market)=>[...events.values()].filter(e=>e.issuer_id===i&&e.market===m);
 const attemptOf=(i:string,m:Market,attemptId:number)=>{
  const st=states.get(sk(i,m));
  if(!st||!Number.isInteger(attemptId)||attemptId<1||attemptId>st.attempt_seq)throw internal('invalid_attempt');
  return st;
 };
 const raw:CompanyDb={
  async digestDue(at,limit,market){
   const t=at.toISOString();
   const rows=facts.scope().filter(s=>!market||s.market===market).map(s=>({s,dr:states.get(sk(s.issuer_id,s.market))?.digested_rev??0,next:states.get(sk(s.issuer_id,s.market))?.next_attempt_at??EPOCH}))
    .filter(r=>r.s.state_rev>r.dr&&r.next<=t);
   rows.sort((a,b)=>(b.s.state_rev-b.dr)-(a.s.state_rev-a.dr)||cmp(a.s.issuer_id,b.s.issuer_id)||cmp(a.s.market,b.s.market));
   return rows.slice(0,Math.max(0,limit)).map(r=>({issuerId:r.s.issuer_id,market:r.s.market,stateRev:r.s.state_rev,digestedRev:r.dr}));
  },
  async sweepDue(olderThan,at,limit,market){
   const older=olderThan.toISOString();const t=at.toISOString();
   const rows=facts.scope().filter(s=>!market||s.market===market).map(s=>({s,st:states.get(sk(s.issuer_id,s.market))}))
    .filter(({s,st})=>s.state_rev>0&&(!st?.swept_at||st.swept_at<older)&&(st?.next_attempt_at??EPOCH)<=t);
   rows.sort((a,b)=>{const x=a.st?.swept_at??null,y=b.st?.swept_at??null;return (x===y?0:x===null?-1:y===null?1:cmp(x,y))||cmp(a.s.issuer_id,b.s.issuer_id)||cmp(a.s.market,b.s.market);});
   return rows.slice(0,Math.max(0,limit)).map(({s,st})=>({issuerId:s.issuer_id,market:s.market,stateRev:s.state_rev,digestedRev:st?.digested_rev??0}));
  },
  async beginAttempt(issuer,market,at){
   if(!scopeOf(issuer,market))throw noStream();
   const k=sk(issuer,market);const st=states.get(k);const t=at.toISOString();
   if(!st){
    states.set(k,{issuer_id:issuer,market,digested_rev:0,attempt_seq:1,last_attempt_id:1,last_success_attempt_id:null,last_failed_attempt_id:null,last_attempt_at:t,last_status:null,consecutive_failures:0,next_attempt_at:EPOCH,swept_at:null,updated_at:now()});
    return 1;
   }
   st.attempt_seq+=1;st.last_attempt_id=st.attempt_seq;st.last_attempt_at=t;st.updated_at=now();
   return st.attempt_seq;
  },
  async replaceDigest(issuer,market,batch,attemptId,rebuildId,basedOnRev,sweep,input,cov){
   const s=scopeOf(issuer,market);
   if(!s)throw noStream();
   if(basedOnRev!==s.state_rev)throw new CompanyDbError('stale_computation','stale_computation');
   const st=attemptOf(issuer,market,attemptId);
   if(attemptId<(st.last_success_attempt_id??0))throw new CompanyDbError('stale_attempt','stale_attempt');
   const b=batches.get(batch);
   if(!b||b.producer!=='company-digest'||b.status!=='running')throw internal('invalid_batch');
   const k=sk(issuer,market);
   if(streamEvents(issuer,market).some(e=>e.rebuild_id===rebuildId)||coverage.get(k)?.rebuild_id===rebuildId)ev('rebuild_id: already used by this stream (one id per replace call)');
   const wire=JSON.parse(JSON.stringify({events:input,coverage:cov})) as {events:unknown;coverage:unknown};
   if(!Array.isArray(wire.events))ev('events: array expected');
   const x=ctx(issuer,market);
   for(const e of wire.events)checkEvent(x,e);
   const list=wire.events as EventInput[];
   if(new Set(list.map(e=>`${e.kind}\u0001${e.natural_key}`)).size!==list.length)ev('events: duplicate (kind, natural_key)');
   const c=checkCoverage(wire.coverage);
   const t=now();let upserted=0,changed=0,revived=0,retired=0;
   for(const e of list){
    const id=eventIdOf(issuer,market,e.kind,e.natural_key);const hash=payloadHashOf(e.payload);const old=events.get(id);
    const next={kind:e.kind,natural_key:e.natural_key,occurred_on:e.occurred_on,period_end:e.period_end,concept:e.concept,filing_id:e.filing_id,payload:e.payload,meta:e.meta,
     payload_hash:hash,based_on_rev:basedOnRev,rebuilt_at:t,rebuild_id:rebuildId,rebuild_batch_id:batch,retired_at:null};
    if(!old){events.set(id,{...next,event_id:id,issuer_id:issuer,market,first_seen_at:t,payload_changed_at:null});changed++;}
    else{
     if(old.payload_hash!==hash)changed++;
     if(old.retired_at!==null)revived++;
     events.set(id,{...old,...next,payload_changed_at:old.payload_hash!==hash?t:old.payload_changed_at});
    }
    upserted++;
   }
   for(const e of streamEvents(issuer,market))if(e.rebuild_id!==rebuildId&&e.retired_at===null){e.retired_at=t;retired++;}
   coverage.set(k,{...clone(c),scope_last_success_at:c.scope_last_success_at===null?null:new Date(c.scope_last_success_at).toISOString(),
    issuer_id:issuer,market,based_on_rev:basedOnRev,rebuilt_at:t,rebuild_id:rebuildId,rebuild_batch_id:batch});
   const clears=attemptId>(st.last_failed_attempt_id??0);
   st.digested_rev=basedOnRev;st.last_success_attempt_id=Math.max(st.last_success_attempt_id??0,attemptId);
   if(clears){st.last_status='success';st.consecutive_failures=0;st.next_attempt_at=t;if(sweep)st.swept_at=t;}
   st.updated_at=t;
   return {upserted,changed,retired,revived};
  },
  async markDigestFailed(issuer,market,attemptId,at){
   if(!scopeOf(issuer,market))throw noStream();
   const st=attemptOf(issuer,market,attemptId);
   if(attemptId<=Math.max(st.last_success_attempt_id??0,st.last_failed_attempt_id??0))return false;
   const hours=Math.min(24,2**Math.min(st.consecutive_failures,5));
   st.last_failed_attempt_id=attemptId;st.consecutive_failures+=1;st.next_attempt_at=new Date(at.getTime()+hours*3600_000).toISOString();st.last_status='failed';st.updated_at=now();
   return true;
  },
  async backlog(){return {failedStreams:[...states.values()].filter(s=>s.last_status==='failed').length};},
  async digestState(issuer,market){const s=states.get(sk(issuer,market));return s?clone(s):null;},
  async replaceEvidence(issuer,market,attemptId,basedOnRev,rows){
   const sc=scopeOf(issuer,market);if(!sc)throw noStream();
   if(basedOnRev!==sc.state_rev)throw new CompanyDbError('stale_computation','stale_computation');   // evidence fence
   if(attemptId<(states.get(sk(issuer,market))?.last_success_attempt_id??0))throw new CompanyDbError('stale_attempt','stale_attempt');
   const wire=JSON.parse(JSON.stringify(rows)) as unknown;
   if(!Array.isArray(wire))evd('rows: array expected');
   const x=ctx(issuer,market);
   for(const r of wire)checkEvidence(x,r);
   const list=wire as EvidenceIndexRow[];
   if(new Set(list.map(r=>r.fact_id)).size!==list.length)evd('rows: duplicate fact_id');
   const keep=new Set(list.map(r=>r.fact_id));
   for(const r of list)evidence.set(r.fact_id,{...r,captured_at:r.captured_at===null?null:new Date(r.captured_at).toISOString(),issuer_id:issuer,market});
   let deleted=0;
   for(const [id,r] of evidence)if(r.issuer_id===issuer&&r.market===market&&!keep.has(id)){evidence.delete(id);deleted++;}
   return {upserted:list.length,deleted};
  },
  async eventsOfIssuer(issuer,market,o){
   checkEventsQuery(o);
   const cur=o.cursor?decodeIssuerCursor(o.cursor):null;
   const rows=streamEvents(issuer,market).filter(e=>e.retired_at===null&&(o.since===undefined||e.occurred_on>=o.since)&&(o.until===undefined||e.occurred_on<=o.until)
    &&(!o.kinds?.length||o.kinds.includes(e.kind))&&(cur===null||e.occurred_on<cur[0]||(e.occurred_on===cur[0]&&e.event_id>cur[1])));
   rows.sort((a,b)=>cmp(b.occurred_on,a.occurred_on)||cmp(a.event_id,b.event_id));
   return issuerPage(clone(rows.slice(0,o.limit+1)),o.limit);
  },
  async eventsOfIssuers(issuers,o){
   checkEventsQuery(o);
   const cur=o.cursor?decodeInboxCursor(o.cursor):null;
   const want=new Set(issuers);
   if(!want.size)return {rows:[],nextCursor:null};
   const ck=cur===null?null:tsKey(cur[0])!;
   const rows=[...events.values()].filter(e=>{
    if(!want.has(e.issuer_id)||e.retired_at!==null||(o.kinds?.length&&!o.kinds.includes(e.kind)))return false;
    if(ck===null||cur===null)return true;
    const k=tsKey(e.first_seen_at)!;
    return k<ck||(k===ck&&e.event_id<cur[1]);
   });
   return inboxPage(rows.map(r=>({row:clone(r),seen:r.first_seen_at})),o.limit);
  },
  async evidenceOf(ids){
   const out=new Map<string,EvidenceRecord>();
   const runs=new Map(facts.runs().map(r=>[r.run_id,r]));const filings=new Map(facts.filings().map(g=>[g.filing_id,g]));const all=new Map(facts.facts().map(f=>[f.fact_id,f]));
   for(const id of new Set(ids)){
    const e=evidence.get(id);const f=all.get(id);
    if(!e||!f||f.status!=='ok'||filings.get(f.filing_id)?.mapping_gen!==f.mapping_gen)continue;
    const run=runs.get(f.run_id);
    if(!run||run.status!=='published')continue;
    const b=batches.get(run.batch_id);
    const row=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,(e as unknown as Record<string,unknown>)[k]])) as unknown as EvidenceIndexRow;
    out.set(id,clone({...row,run_id:f.run_id,code_version:b?.code_version??null,tool_versions:b?b.tool_versions:null,mapping_version:f.mapping_version}));
   }
   return out;
  },
  async coverageOf(ids){const want=new Set(ids);return sortCoverage([...coverage.values()].filter(c=>want.has(c.issuer_id)).map(c=>clone(c)));},
  async listCoverage(filter,sort,page){
   if(!['latest_available_date','latest_period_end','name'].includes(sort))throw new CompanyDbError('invalid_read','invalid_read: sort: latest_available_date, latest_period_end or name');
   if(!Number.isInteger(page.offset)||page.offset<0||!Number.isInteger(page.limit)||page.limit<1||page.limit>MAX_COVERAGE_PAGE)throw new CompanyDbError('invalid_read','invalid_read: page: offset >= 0, limit 1..200');
   if(filter.market!==undefined&&filter.market!=='US'&&filter.market!=='CN')throw new CompanyDbError('invalid_read','invalid_read: market: US, CN or null');
   const want=filter.issuerIds?new Set(filter.issuerIds):null;
   const rows=[...coverage.values()].filter(c=>(filter.market===undefined||c.market===filter.market)&&(want===null||want.has(c.issuer_id)));
   const desc=(a:string|null,b:string|null)=>a===b?0:a===null?1:b===null?-1:cmp(b,a);
   const nameCmp=(a:string|undefined,b:string|undefined)=>a===b?0:a===undefined?1:b===undefined?-1:compareCodePoints(a,b);   // SQL: missing names last
   rows.sort((a,b)=>(sort==='latest_available_date'?desc(a.latest_available_date,b.latest_available_date):sort==='latest_period_end'?desc(a.latest_period_end,b.latest_period_end):nameCmp(names.get(a.issuer_id),names.get(b.issuer_id)))
    ||cmp(a.issuer_id,b.issuer_id)||cmp(a.market,b.market));
   return {rows:clone(rows.slice(page.offset,page.offset+page.limit)),total:rows.length};
  },
  async watchesOf(userId){return clone([...watches.values()].filter(w=>w.user_id===userId).sort((a,b)=>cmp(b.updated_at,a.updated_at)||cmp(a.issuer_id,b.issuer_id)));},
  async upsertWatch(userId,issuerId){
   if(!names.has(issuerId))throw internal('insert or update on table "company_watches" violates foreign key constraint (unknown issuer)');   // SQL FK; supabaseCompanyDb maps it to internal
   const k=sk(userId,issuerId);const w=watches.get(k);
   if(w)return {row:clone(w),created:false};
   if([...watches.values()].filter(x=>x.user_id===userId).length>=MAX_COMPANY_WATCHES)throw new CompanyDbError('watch_limit',`watch_limit: MAX_COMPANY_WATCHES = ${MAX_COMPANY_WATCHES}`);
   const t=now();const row:WatchRow={user_id:userId,issuer_id:issuerId,note:null,muted:false,created_at:t,updated_at:t};
   watches.set(k,row);
   return {row:clone(row),created:true};
  },
  async patchWatch(userId,issuerId,patch){
   const p=watchPatch(patch);const w=watches.get(sk(userId,issuerId));
   if(!w)return null;
   if(Object.keys(p).length){Object.assign(w,p);w.updated_at=now();}
   return clone(w);
  },
  async deleteWatch(userId,issuerId){
   if(!watches.delete(sk(userId,issuerId)))return false;
   for(const [rk,r] of reads)if(r.user_id===userId&&r.issuer_id===issuerId)reads.delete(rk);
   return true;
  },
  async markRead(userId,issuerId,eventIds){
   const list=checkEventIds(eventIds);
   if(!list.length)return {inserted:0};
   for(const id of list){const e=events.get(id);if(!e||e.issuer_id!==issuerId)throw new CompanyDbError('invalid_read','invalid_read: event does not belong to the issuer');}
   if(!watches.has(sk(userId,issuerId)))throw new CompanyDbError('invalid_read','invalid_read: the issuer is not watched');
   let inserted=0;const t=now();
   for(const id of list){const rk=sk(userId,id);if(!reads.has(rk)){reads.set(rk,{user_id:userId,issuer_id:issuerId,event_id:id,read_at:t});inserted++;}}
   return {inserted};
  },
  async readEventIds(userId,eventIds){
   const out=new Set<string>();
   for(const id of checkEventIds(eventIds))if(reads.has(sk(userId,id)))out.add(id);
   return out;
  },
 };
 let chain:Promise<unknown>=Promise.resolve();
 const serialize=<A extends unknown[],T>(fn:(...a:A)=>Promise<T>)=>(...a:A):Promise<T>=>{const next=chain.then(()=>fn(...a));chain=next.catch(()=>undefined);return next;};
 const db={...raw} as MemoryCompanyDb;
 for(const k of ASYNC_METHODS)(db as unknown as Record<string,unknown>)[k]=serialize(raw[k] as unknown as (...a:unknown[])=>Promise<unknown>);
 db.setNow=iso=>{fixedNow=iso===null?null:new Date(iso).toISOString();};
 db.registerBatch=(id,b={})=>{batches.set(id,{producer:'company-digest',status:'running',code_version:'test-sha',tool_versions:{node:'test'},...b});};
 db.registerIssuer=(id,name)=>{names.set(id,name);};
 db.events=()=>clone([...events.values()]);
 db.coverage=()=>clone([...coverage.values()]);
 db.states=()=>clone([...states.values()]);
 db.watches=()=>clone([...watches.values()]);
 return db;
}
