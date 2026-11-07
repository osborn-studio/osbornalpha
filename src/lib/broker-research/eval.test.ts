// Gold evaluation matching and licence-fenced execution (spec §11.3).
import {describe,expect,it,vi} from 'vitest';
import {corpusHash,evalStats,runGoldEval} from './eval';
import type {EvalRow,GoldDoc} from './eval';
import {EXTRACT_RESPONSE} from './fixtures/pipeline';
import {runParse} from './parse';
import {LlmError,recordedLlmPort} from './ports/llm';
import {brokerPaths} from './storage';
import {ADMIN_ID,DEADLINE,T0,memoryBrokerDeps,seedDocument,seedLicence,syntheticPdf} from './testing';
import {purgeDocument,withdrawDocument} from './withdraw';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryBrokerResearchDb} from './memory-db';

const g=(field:string,value_text:string,value_num:string|null,page=1,s=0,e=5,target_key:string|null='ZZBR',typed:Partial<EvalRow>={}):EvalRow=>({target_key,field,occurrence:1,value_text,value_num,value_currency:null,value_unit:value_num===null?null:'price',value_date:null,page,char_start:s,char_end:e,...typed});
describe('evalStats',()=>{
 const gold:GoldDoc[]=[{sha256:'a'.repeat(64),fields:[g('target_price','120.00','120.00'),g('rating','Overweight',null,1,10,20)],absent:[{target_key:'ZZBR',field:'target_horizon'}]}];
 it('counts tp/fp/fn by complete value and overlapping span',()=>{
  const s=evalStats(gold,[{sha256:gold[0].sha256,rows:[g('target_price','120.0','120.0',1,2,8),g('rating','overweight',null,1,30,40),g('wacc','9%','0.09',2,0,5,null,{value_unit:'pct'})]}]);
  expect(s.per_field.target_price).toEqual({tp:1,fp:0,fn:0,precision:1,recall:1});
  expect(s.per_field.rating).toEqual({tp:0,fp:1,fn:1,precision:0,recall:0});
  expect(s.per_field.wacc).toEqual({tp:0,fp:1,fn:0,precision:0,recall:null});
  expect(s.absence).toEqual({tp:1,fp:0,fn:0});expect(s.precision_min).toBe(0);expect(s.passed).toBe(false);
 });
 it('rejects wrong currency, date, unit and nullability',()=>{
  const fields=[g('target_currency','US$',null,1,0,3,'ZZBR',{value_currency:'USD'}),g('published_date','5 Nov',null,1,10,20,null,{value_date:'2026-11-05'}),g('upside_stated','25%','0.25',1,30,33,'ZZBR',{value_unit:'pct'}),g('target_price','120','120',1,40,43)];
  const docs=[{sha256:'c'.repeat(64),fields,absent:[]}];
  expect(evalStats(docs,[{sha256:docs[0].sha256,rows:fields}]).passed).toBe(true);
  const rows=fields.map(f=>({...f,...({target_currency:{value_currency:'HKD'},published_date:{value_date:'2026-05-11'},upside_stated:{value_unit:'ratio'},target_price:{value_num:null,value_unit:null}} as Record<string,Partial<EvalRow>>)[f.field]}));
  const bad=evalStats(docs,[{sha256:docs[0].sha256,rows}]);
  for(const f of fields)expect(bad.per_field[f.field]).toEqual({tp:0,fp:1,fn:1,precision:0,recall:0});
 });
 it('does not match unlocated candidates and hashes a sorted manifest',()=>{
  const s=evalStats(gold,[{sha256:gold[0].sha256,rows:[{...gold[0].fields[0],char_start:null,char_end:null}]}]);
  expect(s.per_field.target_price).toMatchObject({tp:0,fp:1,fn:1});
  const a={sha256:'a'.repeat(64),fields:[],absent:[]},b={sha256:'b'.repeat(64),fields:[],absent:[]};
  expect(corpusHash([a,b])).toBe(corpusHash([b,a]));
 });
});

describe('runGoldEval authorization and private writes',()=>{
 const setup=async()=>{const d=memoryBrokerDeps();const lic=await seedLicence(d.db);const doc=await seedDocument(d,lic.licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});const llm=recordedLlmPort([EXTRACT_RESPONSE]);d.llm=llm;return {d,lic,doc,llm,docs:[{sha256:doc.sha256,fields:[],absent:[]}] as GoldDoc[]};};
 for(const [name,change,code] of [
  ['forbidden',async(x:Awaited<ReturnType<typeof setup>>)=>{await x.d.db.updateLicence(x.lic.licence_id,{allows_llm_processing:false});await x.d.db.confirmLicence(x.lic.licence_id,ADMIN_ID,2);},'licence_forbids_processing'],
  ['unconfirmed',async(x:Awaited<ReturnType<typeof setup>>)=>{await x.d.db.updateLicence(x.lic.licence_id,{terms_summary:'changed'});},'licence_forbids_processing'],
  ['expired',async(x:Awaited<ReturnType<typeof setup>>)=>{await x.d.db.updateLicence(x.lic.licence_id,{valid_to:'2026-01-02'});await x.d.db.confirmLicence(x.lic.licence_id,ADMIN_ID,2);},'licence_forbids_processing'],
  ['withdrawn',async(x:Awaited<ReturnType<typeof setup>>)=>{await x.d.db.updateDocument(x.doc.document_id,{status:'withdrawn',withdrawn_at:x.d.now().toISOString(),withdrawn_reason:'test'});},'document_withdrawn'],
 ] as const)it(`rejects ${name} before calling the LLM`,async()=>{const x=await setup();await change(x);await expect(runGoldEval(x.d,x.docs,{by:ADMIN_ID,dryRun:false})).rejects.toMatchObject({code});expect(x.llm.calls).toHaveLength(0);});
 it('dry-run checks authorization without calls or a receipt; real run records the pinned version',async()=>{const x=await setup();const dry=await runGoldEval(x.d,x.docs,{by:ADMIN_ID,dryRun:true});expect(dry.receiptId).toBeNull();expect(x.llm.calls).toHaveLength(0);expect(dry.authorized[0]).toMatchObject({licence_version:1,parse_run_id:expect.any(String)});const real=await runGoldEval(x.d,x.docs,{by:ADMIN_ID,dryRun:false});expect(real.receiptId).toMatch(/[0-9a-f-]{36}/);expect(real.authorized[0].licence_version).toBe(1);});
 it('rejects a duplicate manifest document before any model call',async()=>{const x=await setup();await expect(runGoldEval(x.d,[...x.docs,...x.docs],{by:ADMIN_ID,dryRun:false})).rejects.toMatchObject({code:'invalid_gold_manifest'});expect(x.llm.calls).toHaveLength(0);});
 it('preflights every manifest document before the first model call',async()=>{
  const x=await setup();const second=await seedDocument(x.d,x.lic.licence_id,syntheticPdf('unauthorized-second'));
  await expect(runGoldEval(x.d,[...x.docs,{sha256:second.sha256,fields:[],absent:[]}],{by:ADMIN_ID,dryRun:false})).rejects.toMatchObject({code:'document_not_parsed'});
  expect(x.llm.calls).toHaveLength(0);
 });
 it('refuses a reparse between preflight and extraction without a misleading receipt',async()=>{const x=await setup();const b=await seedDocument(x.d,x.lic.licence_id,syntheticPdf('second'));await runParse(x.d,b.document_id,ADMIN_ID,{deadline:DEADLINE()});const base=recordedLlmPort([EXTRACT_RESPONSE,EXTRACT_RESPONSE]);let once=false;x.d.llm={info:()=>base.info(),complete:async(req)=>{if(!once){once=true;await runParse(x.d,b.document_id,ADMIN_ID,{deadline:DEADLINE()});}return base.complete(req);}};const spy=vi.spyOn(x.d.db,'insertEvalReceipt');await expect(runGoldEval(x.d,[...x.docs,{sha256:b.sha256,fields:[],absent:[]}],{by:ADMIN_ID,dryRun:false})).rejects.toMatchObject({code:'parse_run_changed_during_eval'});expect(spy).not.toHaveBeenCalled();expect(base.calls).toHaveLength(1);});
 it('stores completed calls under the document for later purge, including partial evaluations',async()=>{const x=await setup();const b=await seedDocument(x.d,x.lic.licence_id,syntheticPdf('second'));await runParse(x.d,b.document_id,ADMIN_ID,{deadline:DEADLINE()});x.d.llm=recordedLlmPort([EXTRACT_RESPONSE,new LlmError('llm_failed')]);await expect(runGoldEval(x.d,[...x.docs,{sha256:b.sha256,fields:[],absent:[]}],{by:ADMIN_ID,dryRun:false})).rejects.toBeTruthy();expect(await x.d.storage.list(brokerPaths.evalPrefix(x.doc.sha256))).toHaveLength(2);expect((await withdrawDocument(x.d,x.doc.document_id,{reason:'licence ended',purge:true},ADMIN_ID)).purge?.done).toBe(true);expect(await x.d.storage.list(brokerPaths.evalPrefix(x.doc.sha256))).toEqual([]);});
 it('withdrawal during an LLM call stops its writes and releases its lease',async()=>{const x=await setup();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const base=x.llm;x.d.llm={info:()=>base.info(),complete:async(req)=>{await gate;return base.complete(req);}};const outcome=runGoldEval(x.d,x.docs,{by:ADMIN_ID,dryRun:false}).then(()=>'resolved',(e:{code?:string})=>e.code);await new Promise(r=>setTimeout(r,0));expect((await withdrawDocument(x.d,x.doc.document_id,{reason:'end',purge:true},ADMIN_ID)).purge).toBeNull();await expect(purgeDocument(x.d,x.doc.document_id,ADMIN_ID)).rejects.toMatchObject({code:'lease_held'});release();expect(await outcome).toBe('document_withdrawn');expect(await x.d.storage.list(brokerPaths.evalPrefix(x.doc.sha256))).toEqual([]);expect((await x.d.db.getDocument(x.doc.document_id))!.lease_token).toBeNull();expect((await purgeDocument(x.d,x.doc.document_id,ADMIN_ID)).done).toBe(true);});
 it('keeps an in-flight write registered past lease expiry until purge reconciliation',async()=>{const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});const clock={t:T0.getTime()};const db=memoryBrokerResearchDb({tables,now:()=>new Date(clock.t)});const d=memoryBrokerDeps({tables,db});const lic=await seedLicence(d.db),doc=await seedDocument(d,lic.licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});d.llm=recordedLlmPort([EXTRACT_RESPONSE]);const upload=d.storage.upload.bind(d.storage);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let started=false;d.storage.upload=async(path,body,type)=>{if(path.startsWith('eval/')&&!started){started=true;await gate;}return upload(path,body,type);};const outcome=runGoldEval(d,[{sha256:doc.sha256,fields:[],absent:[]}],{by:ADMIN_ID,dryRun:false}).then(()=>'resolved',(e:{code?:string})=>e.code);for(let i=0;i<50&&!started;i++)await new Promise(r=>setTimeout(r,0));expect(started).toBe(true);expect((await d.db.pendingWritesFor(doc.document_id)).map(w=>w.writer)).toEqual(['eval']);clock.t+=301_000;d.advance(301_000);expect((await withdrawDocument(d,doc.document_id,{reason:'end',purge:true},ADMIN_ID)).purge?.done).toBe(true);release();expect(await outcome).toBe('document_withdrawn');expect((await purgeDocument(d,doc.document_id,ADMIN_ID)).done).toBe(true);expect(await d.storage.list(brokerPaths.evalPrefix(doc.sha256))).toEqual([]);});
 it('retries a failed self-delete of a late evaluation object',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});
  const clock={t:T0.getTime()},db=memoryBrokerResearchDb({tables,now:()=>new Date(clock.t)}),d=memoryBrokerDeps({tables,db});
  const lic=await seedLicence(d.db),doc=await seedDocument(d,lic.licence_id,syntheticPdf('failed-self-delete'));
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});d.llm=recordedLlmPort([EXTRACT_RESPONSE]);
  const upload=d.storage.upload.bind(d.storage);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let started=false;
  d.storage.upload=async(path,body,type)=>{if(path.startsWith('eval/')&&!started){started=true;await gate;}return upload(path,body,type);};
  const outcome=runGoldEval(d,[{sha256:doc.sha256,fields:[],absent:[]}],{by:ADMIN_ID,dryRun:false}).then(()=>'resolved',(e:{code?:string})=>e.code);
  for(let i=0;i<50&&!started;i++)await new Promise(r=>setTimeout(r,0));expect(started).toBe(true);
  clock.t+=301_000;d.advance(301_000);expect((await withdrawDocument(d,doc.document_id,{reason:'end',purge:true},ADMIN_ID)).purge?.done).toBe(true);
  d.storage.failNext('remove','down');release();expect(await outcome).toBe('document_withdrawn');
  expect(await d.storage.list(brokerPaths.evalPrefix(doc.sha256))).toHaveLength(1);
  expect((await purgeDocument(d,doc.document_id,ADMIN_ID)).done).toBe(true);
  expect(await d.storage.list(brokerPaths.evalPrefix(doc.sha256))).toEqual([]);
 });
 it('retains a terminated worker write in reconciliation after thirty days',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});
  const clock={t:T0.getTime()},db=memoryBrokerResearchDb({tables,now:()=>new Date(clock.t)}),d=memoryBrokerDeps({tables,db});
  const lic=await seedLicence(d.db),doc=await seedDocument(d,lic.licence_id,syntheticPdf('terminated'));
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});d.llm=recordedLlmPort([EXTRACT_RESPONSE]);
  const upload=d.storage.upload.bind(d.storage);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let started=false;
  d.storage.upload=async(path,body,type)=>{if(path.startsWith('eval/')&&!started){started=true;await gate;}return upload(path,body,type);};
  const outcome=runGoldEval(d,[{sha256:doc.sha256,fields:[],absent:[]}],{by:ADMIN_ID,dryRun:false}).then(()=>'resolved',(e:{code?:string})=>e.code);
  for(let i=0;i<50&&!started;i++)await new Promise(r=>setTimeout(r,0));expect(started).toBe(true);
  clock.t+=301_000;d.advance(301_000);expect((await withdrawDocument(d,doc.document_id,{reason:'end',purge:true},ADMIN_ID)).purge?.done).toBe(true);
  clock.t+=30*86_400_000;d.advance(30*86_400_000);
  expect((await purgeDocument(d,doc.document_id,ADMIN_ID)).done).toBe(true);
  expect((await d.db.unreconciledWrites(10)).map(w=>w.writer)).toEqual(['eval']);
  release();expect(await outcome).toBe('document_withdrawn');
 });
});
