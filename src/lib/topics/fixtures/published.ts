// Topic public fixtures (spec §5.4, §6): real resolver payloads and storage transitions.
import {memoryResolver} from '@/lib/evidence';
import {allFixtures} from '@/lib/evidence/fixtures';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {CELL} from '@/lib/evidence/fixtures/industry';
import {FACT} from '@/lib/evidence/fixtures/facts';
import {JUDGMENT} from '@/lib/evidence/fixtures/judgments';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import type {EvidenceKind,EvidenceRef} from '@/lib/evidence/ref';
import type {Resolved} from '@/lib/evidence/resolve';
import {memoryTopicsDb} from '../memory-db';
import type {DraftBody,TopicSnapshot,UnpublishReason} from '../types';
const actor='70000000-0000-4000-8000-000000000001';
const cutoff='2026-11-01T00:00:00.000Z';
const second='10000000-0000-4000-8000-000000000007';
const seed=allFixtures();
// Extend the seed with a second period; all evidence predates publication.
const first=seed.macro!.rows!.find(r=>r.observation_id===OBS.unrateV1)!;
first.value_text='3.75';
seed.macro!.rows!.push({...first,observation_id:second,period_end:'2026-09-30',value_text:'4.3',available_at:'2026-10-05T12:30:00.000Z'});
seed.industry!.cells!.find(c=>c.key.run_id===CELL.sicOk.split(':')[0])!.run.activated_at='2026-10-01T00:00:00.000Z';
const refs:[EvidenceKind,string][]=[['macro_observation',OBS.unrateV1],['macro_observation',second],['financial_fact',FACT.usOk],['industry_metric',CELL.sicOk],['judgment',JUDGMENT.ok]];
for(let n=0;n<9;n++){
 const source=seed.facts!.infos!.find(f=>f.row.fact_id===FACT.cnPending)!;
 const id=`30000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`;
 seed.facts!.infos!.push({...structuredClone(source),row:{...source.row,fact_id:id}});
 seed.facts!.ineligible!.set(id,'citation_pending');refs.push(['financial_fact',id]);
}
const resolver=memoryResolver(seed);
const resolved=await resolver.resolve(refs.map(([kind,id]):EvidenceRef=>({v:1,kind,id,as_of:cutoff})),{audience:'public',locale:'zh',now:new Date(cutoff)});
if(resolved.receipt.errors.length)throw new Error('fixture_resolution_failed');
function snapshot(slug:string,items:Resolved[]):TopicSnapshot{
 const company=slug==='cn-company';
 const evidence=items.map((r,i)=>({ordinal:i+1,section_key:'s1',ref:r.ref,ref_hash:sha256Hex(canonicalJson(r.ref)),resolved:structuredClone(r)}));
 const counts={ok:0,missing:0,withheld:0,not_served:0,unsupported:0,retracted:0};for(const e of evidence)counts[e.resolved.state]++;
 return {topic:{slug,category:company?'company':'macro',title:{zh:company?'中国公司披露':'利率与银行',en:company?'China company disclosures':'Rates and banks'},dek:{zh:'公开证据与研究记录',en:'Public evidence and research notes'}},
  sections:[{key:'s1',title:{zh:'证据',en:'Evidence'},note:null,items:[...evidence.map(e=>({ordinal:e.ordinal})),{expected_slot:'industry'}]}],evidence,
  expected_slots:[{key:'industry',kind:'industry_metric',label:{zh:'行业数据',en:'Industry data'},reason_code:'industry_not_published'}],
  entries:[{key:'note',entry_type:'owner_note',body:{zh:'记录公开证据的变化。',en:'Record changes in public evidence.'}}],summary:null,counts,
  freshness_at_publication:{'macro.fred':'fresh','facts.us':'fresh','industry.agg.sic':'fresh'},contract_version:'evidence-ref/1',resolver_versions:resolver.versions()};
}
export function maskingFixture(){
 const s=snapshot('rates-and-banks',resolved.resolved.slice(0,3));
 s.summary={facts:[{fact_id:'ev:1',text:'3.75',refs:[1]},{fact_id:'ev:2',text:'4.3',refs:[2]},{fact_id:'ev:3',text:'1000',refs:[3]}],
  points:[{text:'3.75 and 1000',fact_ids:['ev:1','ev:3'],refs:[1,3]},{text:'4.3',fact_ids:['ev:2'],refs:[2]}],counterpoints:[],incomparable:[],prompt_version:'fixture/1',validator_version:'fixture/1',model:'fixture',provider:'fixture'};
 return {snapshot:s};
}

// The memory port generates UUIDs internally. Translate storage identities at the fixture
// boundary so callers see deterministic IDs without patching global crypto or the shared port.
function deterministicDb():ReturnType<typeof memoryTopicsDb>{
 const real=memoryTopicsDb(),forward=new Map<string,string>(),reverse=new Map<string,string>();
 const register=(id:string)=>{
  if(!forward.has(id)){const stable=`70000000-0000-4000-8000-${String(forward.size+10).padStart(12,'0')}`;forward.set(id,stable);reverse.set(stable,id);}
 };
 const visit=(value:unknown)=>{
  if(Array.isArray(value))value.forEach(visit);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
   if(['topic_id','draft_id','receipt_id','version_id'].includes(key)&&typeof item==='string')register(item);
   else visit(item);
  }
 };
 const translate=(value:unknown,map:Map<string,string>):unknown=>{
  if(typeof value==='string')return map.get(value)??value;
  if(Array.isArray(value))return value.map(v=>translate(v,map));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,translate(v,map)]));
  return value;
 };
 return new Proxy(real,{get(target,key){
  const method=Reflect.get(target,key);
  if(key==='now'||key==='setPublicFlag')return method;
  return async(...args:unknown[])=>{
   const out:unknown=await Reflect.apply(method,target,args.map(a=>translate(a,reverse)));
   if(key==='recordDisclosure'&&typeof out==='string')register(out);else visit(out);
   return translate(out,forward);
  };
 }});
}
export function publishedFixture(){
 const store=deterministicDb();store.setPublicFlag(true);store.now(new Date(cutoff));
 const rates=snapshot('rates-and-banks',resolved.resolved.slice(0,5));
 const company=snapshot('cn-company',[...resolved.resolved.slice(0,3),...resolved.resolved.slice(5)]);
 const snapshots:Record<string,Record<number,TopicSnapshot>>={'rates-and-banks':{1:structuredClone(rates),2:structuredClone(rates)},'cn-company':{1:company}};
 const ids=new Map<string,string>();
 const ready=(async()=>{
  for(const slug of ['cn-company','rates-and-banks']){
   const s=snapshots[slug][1];
   const body:DraftBody={title:s.topic.title,dek:s.topic.dek,sections:s.sections,evidence:s.evidence.map(e=>({ordinal:e.ordinal,section_key:e.section_key,ref:e.ref})),expected_slots:s.expected_slots,entries:s.entries,blocks_provenance:{note:'owner'}};
   const topic=await store.createTopic({slug,category:s.topic.category,body,actor});ids.set(slug,topic.topic_id);
   for(const [n,s] of Object.entries(snapshots[slug])){
    store.now(new Date(Number(n)===2?'2026-11-08T09:00:00.000Z':'2026-11-01T09:00:00.000Z'));
    const receiptId=await store.recordDisclosure({topicId:topic.topic_id,draftHash:topic.draft_hash,checks:[],passed:true,codeVersion:'fixture/1',actor});
    await store.publish({topicId:topic.topic_id,expectedDraftHash:topic.draft_hash,snapshotText:canonicalJson(s),
     evidence:s.evidence.map(e=>({ordinal:e.ordinal,kind:e.ref.kind,ref:e.ref,ref_hash:e.ref_hash,as_of:e.ref.as_of,state:e.resolved.state,digest:e.resolved.digest,section_key:e.section_key})),
     summaryId:null,receiptId,cutoff,actor});
   }
  }
  store.now(new Date('2026-11-15T00:00:00.000Z'));
 })();
 // Keep the plan's synchronous fixture API while waiting for real asynchronous writes.
 const db=new Proxy(store,{get(target,key){
  const method=Reflect.get(target,key);
  if(key==='now'||key==='setPublicFlag')return method;
  return async(...args:unknown[])=>{await ready;return Reflect.apply(method,target,args);};
 }});
 return {db,snapshots,
  async unpublishCurrent(slug:string,reason:UnpublishReason){await ready;return db.unpublish({topicId:ids.get(slug)!,reason,note:null,actor});},
  async retire(slug:string,reason:UnpublishReason){await ready;return db.retire({topicId:ids.get(slug)!,reason,note:null,actor});},
 };
}
