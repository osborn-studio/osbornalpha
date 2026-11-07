// src/lib/broker-research/db-contract.ts
// Shared BrokerResearchDb contract (spec §4.4–§4.14, §6.2–§6.5, §10.2): the same scenarios run
// against memoryBrokerResearchDb (db.test.ts) and pgBrokerResearchDb (broker-research.integration
// .test.ts block 4), so the rules the service unit tests rely on are the SQL functions' rules. Not
// a test file: it registers describe/it only when called. Hash VALUES are never compared across
// implementations (SQL jsonb text vs canonicalJson) — only equal/unequal relations.
import {createHash,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {effectiveValue} from './effective';
import {BrokerResearchDbError} from './types';
import type {BrokerResearchDb,CandidateFieldInput,LicenceInput,NormalizedRating,OutboxEvent,RuleResult} from './types';
import {CLAIM_METHODOLOGY_VERSION,DISCLOSURE_VERSION,RULES_VERSION,UPSIDE_FORMULA_VERSION} from './versions';

export interface BrokerContractHarness{
 db:BrokerResearchDb;tables:TableClient;
 issuer():Promise<string>;
 stock(ticker:string,market:'A'|'HK'|'US'):Promise<void>;
 expireLease(documentId:string):Promise<void>;
 outbox():Promise<OutboxEvent[]>;
 batch():Promise<string>;
 close?():Promise<void>;
}
export const hex64=()=>createHash('sha256').update(randomUUID()).digest('hex');
export const PASS_CHECK={version:DISCLOSURE_VERSION,inputs_hash:'0'.repeat(64),passed:true,hits:[]};
export function licenceInput(o:Partial<LicenceInput>={}):LicenceInput{
 return {source_label:'Contract terminal',licence_kind:'terminal_subscription',holder:'Owner',terms_summary:'contract terms',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:200,valid_from:'2020-01-01',valid_to:null,...o};
}
export function candidate(o:Partial<CandidateFieldInput>&Pick<CandidateFieldInput,'field'|'value_text'>):CandidateFieldInput{
 return {target_key:null,occurrence:1,value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',extractor:'llm:m-test@r',extractor_confidence:0.9,conflict_group:null,detail:{},status:'extracted',...o};
}
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof BrokerResearchDbError?e.code:`not_db_error:${String(e)}`);
const titlesPass=(surfaces:string[]):RuleResult[]=>surfaces.map(surface=>({rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface,hits:[]}}));

export function brokerResearchDbContract(label:string,setup:()=>Promise<BrokerContractHarness>):void{
 describe(label,()=>{
  let h:BrokerContractHarness;let db:BrokerResearchDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await db?.setApprovedGoldCorpus(null,randomUUID()).catch(()=>{});await db?.setPublicEnabled(false,randomUUID()).catch(()=>{});await h?.close?.();},30000);
  const by=randomUUID();
  /** Licence (confirmed) → document → leased parse (succeeded, current) → report → extract run → extract_commit. */
  const world=async(o:{licence?:Partial<LicenceInput>;tk?:string;extra?:(tk:string)=>CandidateFieldInput[]}={})=>{
   const lic=await db.insertLicence(licenceInput(o.licence));expect(await db.confirmLicence(lic.licence_id,by,1)).toBe('confirmed');
   const sha=hex64();const doc=randomUUID();
   expect(await db.insertDocument({document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:10,licence_id:lic.licence_id,uploaded_by:by,original_filename:'r.pdf'})).toBe('inserted');
   await db.updateDocument(doc,{promotion_pending:false});
   const token=randomUUID();expect(await db.claimLease(doc,token,300)).toBe(true);
   const parse=randomUUID();
   await db.insertRun({run_id:parse,document_id:doc,kind:'parse',parse_run_id:null,extractor_version:null,artifact_path:null,artifact_hash:null,model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:'test',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});
   expect(await db.fencedUpdateDocument(doc,token,{status:'parsing'})).toBe('ok');
   expect(await db.finishRun(parse,token,{status:'succeeded',extractor_version:'f3/1',artifact_path:`reports/${sha}.extract.${parse}.json`,artifact_hash:hex64()})).toBe('ok');   // F3 reports its version at finish
   expect((await db.getRun(parse))!.extractor_version).toBe('f3/1');
   expect(await db.fencedUpdateDocument(doc,token,{status:'parsed',current_parse_run_id:parse,page_count:10})).toBe('ok');
   const rep=(await db.ensureReport(doc,'test')).report_id;
   const digest=hex64();const ext=randomUUID();
   await db.insertRun({run_id:ext,document_id:doc,kind:'extract',parse_run_id:parse,extractor_version:null,artifact_path:null,artifact_hash:null,model_id:'m-test',registry_hash:'r'.repeat(64),prompt_version:'broker-extract/1',schema_version:'extract-schema/1',code_version:'test',behavior_digest:digest,licence_version:1,request_path:null,response_path:null,batch_id:null});
   const tk=o.tk??`${1000+Math.floor(Math.random()*8999)}.HK`;await h.stock(tk,'HK');const iss=await h.issuer();
   const rows=[
    candidate({field:'institution',value_text:'Contract Securities'}),
    candidate({field:'published_date',value_text:'2026-03-05',value_date:'2026-03-05'}),
    candidate({field:'title',value_text:'Contract: Upgrade',detail:{lang:'en'}}),
    candidate({field:'ticker',target_key:tk,value_text:tk.replace('.',' '),resolution:{method:'parseBrokerTicker/1',issuer_securities_row:{issuer_id:iss,ticker:tk,valid_from:'2000-01-01',valid_to:null}}}),
    candidate({field:'rating',target_key:tk,value_text:'Buy'}),
    candidate({field:'target_price',target_key:tk,value_text:'120',value_num:'120',value_unit:'price'}),
    candidate({field:'target_currency',target_key:tk,value_text:'HK$',value_currency:'HKD'}),
    candidate({field:'price_at_report',target_key:tk,value_text:'100',value_num:'100',value_unit:'price'}),
    candidate({field:'price_currency',target_key:tk,value_text:'HKD',value_currency:'HKD'}),
    candidate({field:'price_as_of_date',target_key:tk,value_text:'2026-03-04',value_date:'2026-03-04'}),
    ...(o.extra?.(tk)??[])];
   const receipt=await db.extractCommit(doc,token,ext,rows);
   return {lic,doc,sha,token,parse,rep,ext,digest,tk,iss,receipt};
  };
  const GOLD=hex64();
  const allFields=['institution','published_date','title','ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date'];
  const rules=async(rep:string,results?:RuleResult[])=>{
   const r=(await db.getReport(rep))!;
   const surfaces=(['title_original','title_public','title_zh','title_en'] as const).filter(k=>r[k]!==null);
   return db.insertRuleReceipt({report_id:rep,rules_version:RULES_VERSION,input_hash:r.rules_input_hash!,results:results??titlesPass(surfaces),code_version:'test'});
  };
  const gold=async(digest:string)=>{
   await db.setApprovedGoldCorpus(GOLD,by);
   return db.insertEvalReceipt({corpus_kind:'gold',corpus_hash:GOLD,behavior_digest:digest,extractor_version:'f3/1',model_id:'m-test',registry_hash:'r',prompt_version:'p',schema_version:'s',code_version:'t',n_docs:30,
    per_field:Object.fromEntries(allFields.map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}])),absence:{tp:0,fp:0,fn:0},precision_min:1,recall_min:1,passed:true,ran_by:by});
  };
  const ready=async(o:Parameters<typeof world>[0]={})=>{
   const w=await world(o);
   for(const f of (await db.listFields(w.rep)).filter(x=>x.status==='extracted'||x.status==='unverified'))await db.fieldReview(f.field_id,'confirm',{},by);
   const inst=await db.upsertInstitution({name_en:`Contract Inst ${randomUUID()}`,name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
   await db.updateReportDraft(w.rep,{institution_id:inst,scope:'single_issuer',review_status:'approved'});
   await db.insertRatingScale({institution_id:inst,raw_label:'Buy',normalized:'buy',source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by});
   await db.materialize(w.rep);await rules(w.rep);await gold(w.digest);
   expect(await db.publishBlockers(w.rep)).toEqual([]);
   return {...w,inst};
  };

  it('settings and licences: default off, version bump on material change only, confirmation by version',async()=>{
   expect((await db.getSettings()).public_enabled).toBe(false);
   await db.setPublicEnabled(true,by);expect((await db.getSettings())).toMatchObject({public_enabled:true,updated_by:by});await db.setPublicEnabled(false,by);
   const g=hex64();await db.setApprovedGoldCorpus(g,by);
   expect(await db.getSettings()).toMatchObject({approved_gold_corpus_hash:g,approved_gold_corpus_by:by});expect((await db.getSettings()).approved_gold_corpus_at).not.toBeNull();
   await db.setApprovedGoldCorpus(null,by);expect(await db.getSettings()).toMatchObject({approved_gold_corpus_hash:null,approved_gold_corpus_by:null,approved_gold_corpus_at:null});
   expect(await code(db.setApprovedGoldCorpus('not-a-hash',by))).toBe('constraint_violation');
   const l=await db.insertLicence(licenceInput());
   expect(l).toMatchObject({version:1,confirmed_at:null,confirmed_version:null});
   expect(await db.confirmLicence(l.licence_id,by,2)).toBe('version_mismatch');
   expect(await db.confirmLicence(l.licence_id,by,1)).toBe('confirmed');
   expect(await db.updateLicence(l.licence_id,{source_label:'Renamed'})).toMatchObject({version:1,confirmed_version:1,source_label:'Renamed'});
   expect(await db.updateLicence(l.licence_id,{snippet_max_chars:150})).toMatchObject({version:2,confirmed_at:null,confirmed_by:null,confirmed_version:null});
   expect(await db.confirmLicence(l.licence_id,by,1)).toBe('version_mismatch');
   expect(await code(db.updateLicence(randomUUID(),{holder:'x'}))).toBe('not_found');
   expect(await code(db.insertLicence(licenceInput({snippet_max_chars:501})))).toBe('constraint_violation');
   expect((await db.listLicences()).some(x=>x.licence_id===l.licence_id)).toBe(true);
  });

  it('intents: compare-and-set transitions stamp checkpoint_at; an illegal move is intent_transition_invalid',async()=>{
   const l=await db.insertLicence(licenceInput());const id=randomUUID();
   await db.insertIntent({intent_id:id,sha256:hex64(),byte_size:10,licence_id:l.licence_id,original_filename:'a.pdf',created_by:by,expires_at:new Date(Date.now()+7200e3).toISOString(),status:'open',staging_path:`staging/${id}.pdf`,document_id:null});
   expect((await db.getIntent(id))).toMatchObject({status:'open',checkpoint_at:null});
   expect(await db.transitionIntent(id,'open','validating')).toBe(true);
   expect(await db.transitionIntent(id,'open','validating')).toBe(false);
   expect((await db.getIntent(id))!.checkpoint_at).not.toBeNull();
   expect(await code(db.transitionIntent(id,'validating','committed'))).toBe('intent_transition_invalid');
   expect(await db.transitionIntent(id,'validating','open')).toBe(true);                       // staging object missing: retryable (P-R1-07)
   expect((await db.getIntent(id))!.status).toBe('open');
   expect(await db.transitionIntent(id,'open','validating')).toBe(true);
   expect(await db.transitionIntent(id,'validating','abandoned',{error_code:'sha_mismatch'})).toBe(true);
   expect(await db.getIntent(id)).toMatchObject({status:'abandoned',error_code:'sha_mismatch'});
  });

  it('documents and leases: duplicate sha, CAS claim, expiry takeover fails running runs, fenced writes, finish once',async()=>{
   const l=await db.insertLicence(licenceInput());const sha=hex64();const doc=randomUUID();
   const row={document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:10,licence_id:l.licence_id,uploaded_by:by,original_filename:'r.pdf'};
   expect(await db.insertDocument(row)).toBe('inserted');expect(await db.insertDocument({...row,document_id:randomUUID()})).toBe('duplicate');
   expect(await db.findDocumentBySha(sha)).toMatchObject({document_id:doc,status:'uploaded',promotion_pending:true});
   expect(await code(db.updateDocument(doc,{status:'parsed'}))).toBe('document_transition_invalid');
   const a=randomUUID(),b=randomUUID();
   expect(await db.claimLease(doc,a,300)).toBe(true);expect(await db.claimLease(doc,b,300)).toBe(false);
   const r1=randomUUID();
   await db.insertRun({run_id:r1,document_id:doc,kind:'parse',parse_run_id:null,extractor_version:'f3/1',artifact_path:null,artifact_hash:null,model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:'t',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});
   await h.expireLease(doc);
   expect(await db.claimLease(doc,b,300)).toBe(true);
   expect(await db.getRun(r1)).toMatchObject({status:'failed',detail:{error_code:'lease_expired'}});
   expect(await db.fencedUpdateDocument(doc,a,{status:'parsing'})).toBe('lease_lost');
   const r2=randomUUID();
   await db.insertRun({run_id:r2,document_id:doc,kind:'parse',parse_run_id:null,extractor_version:'f3/1',artifact_path:null,artifact_hash:null,model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:'t',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});
   expect(await db.finishRun(r2,a,{status:'succeeded'})).toBe('lease_lost');
   expect(await db.getRun(r2)).toMatchObject({status:'failed',detail:{error_code:'lease_lost',lease_lost:true}});
   expect(await code(db.finishRun(r2,b,{status:'failed'}))).toBe('run_finished');
   expect(await db.fencedUpdateDocument(doc,b,{status:'parsing',releaseLease:true})).toBe('ok');
   expect(await db.getDocument(doc)).toMatchObject({status:'parsing',lease_token:null,lease_until:null});
   expect((await db.listRuns(doc)).map(r=>r.run_id)).toEqual([r1,r2]);
   // renewLease (P-R3-04): only the live holder renews; a withdrawn document answers document_withdrawn and keeps the lease for release
   const c=randomUUID();expect(await db.claimLease(doc,c,300)).toBe(true);
   expect(await db.renewLease(doc,randomUUID(),300)).toBe('lease_lost');
   expect(await db.renewLease(doc,c,300)).toBe('ok');
   await db.updateDocument(doc,{status:'withdrawn',withdrawn_at:new Date().toISOString(),withdrawn_reason:'t'});
   expect(await db.renewLease(doc,c,300)).toBe('document_withdrawn');
   expect(await db.fencedUpdateDocument(doc,c,{releaseLease:true})).toBe('ok');
   expect(await db.renewLease(doc,c,300)).toBe('lease_lost');

  });

  it('extractCommit: candidate-basis receipt, typed targets, lease fence, supersede on re-extraction',async()=>{
   const w=await world();
   expect(w.receipt).toMatchObject({targets:1,basis:'candidate'});expect(w.receipt.materializedHash).toBe(w.receipt.effectiveHash);
   expect(await db.listTargets(w.rep)).toEqual([expect.objectContaining({target_key:w.tk,basis:'candidate',security_ticker:w.tk,issuer_id:w.iss,target_price:'120',target_currency:'HKD',price_at_report:'100',upside_pct:'0.200000',upside_formula_version:UPSIDE_FORMULA_VERSION,price_as_of_date:'2026-03-04'})]);
   expect(await db.getReport(w.rep)).toMatchObject({title_original:'Contract: Upgrade',title_lang:'en',published_date:'2026-03-05'});
   const fields=await db.listFields(w.rep);expect(fields).toHaveLength(10);expect(fields[0].target_key).toBeNull();
   expect(typeof fields.find(f=>f.field==='target_price')!.value_num).toBe('string');
   const ext2=randomUUID();
   await db.insertRun({run_id:ext2,document_id:w.doc,kind:'extract',parse_run_id:w.parse,extractor_version:null,artifact_path:null,artifact_hash:null,model_id:'m-test',registry_hash:'r'.repeat(64),prompt_version:'p',schema_version:'s',code_version:'t',behavior_digest:w.digest,licence_version:1,request_path:null,response_path:null,batch_id:null});
   expect(await code(db.extractCommit(w.doc,randomUUID(),ext2,[]))).toBe('lease_lost');
   expect(await code(db.extractCommit(w.doc,w.token,ext2,[{...candidate({field:'title',value_text:'x'}),status:'confirmed' as 'extracted'}]))).toBe('invalid_rows');
   await db.extractCommit(w.doc,w.token,ext2,[candidate({field:'title',value_text:'Contract: Upgrade v2'})]);
   expect(await db.listFields(w.rep)).toHaveLength(1);
   expect(await db.listFields(w.rep,{includeSuperseded:true})).toHaveLength(11);
   expect(await db.listTargets(w.rep)).toEqual([]);
   await h.expireLease(w.doc);
   expect(await code(db.extractCommit(w.doc,w.token,ext2,[]))).toBe('lease_lost');
  });

  it('fieldReview: conflict siblings rejected, effective basis, typed corrections with explicit null, atomic failure, absent, effective_exists',async()=>{
   const w=await world({extra:tk=>[candidate({field:'rating',target_key:tk,value_text:'Overweight',conflict_group:'g'})]});
   const live=async(field:string)=>(await db.listFields(w.rep)).filter(f=>f.field===field&&(f.status==='extracted'||f.status==='unverified'));
   expect((await db.listTargets(w.rep))[0].rating_raw).toBeNull();
   const ow=(await live('rating')).find(f=>f.value_text==='Overweight')!;
   expect(await code(db.fieldReview(ow.field_id,'confirm',{detail:'x'},by))).toBe('invalid_payload');
   expect(await code(db.fieldReview(ow.field_id,'confirm',{page:1,char_start:5},by))).toBe('invalid_payload');                     // partial span
   await db.fieldReview(ow.field_id,'confirm',{page:1,char_start:5,char_end:15,value_source_text:'Overweight',detail:{framed:true}},by);
   expect((await db.listFields(w.rep)).find(f=>f.field_id===ow.field_id)).toMatchObject({detail:expect.objectContaining({framed:true}),page:1,char_start:5,char_end:15,value_source_text:'Overweight'});   // framed confirm: span written, payload.detail merged (replay)
   expect((await db.listFields(w.rep)).filter(f=>f.field==='rating').map(f=>[f.value_text,f.status]).sort()).toEqual([['Buy','rejected'],['Overweight','confirmed']]);
   for(const f of (await db.listFields(w.rep)).filter(x=>x.status==='extracted'))await db.fieldReview(f.field_id,'confirm',{},by);
   expect((await db.listTargets(w.rep))[0]).toMatchObject({basis:'effective',rating_raw:'Overweight'});
   const pc=(await db.listFields(w.rep)).find(f=>f.field==='price_currency')!;
   const before=await db.listFields(w.rep);
   expect(await code(db.fieldReview(pc.field_id,'correct',{value_text:'USD',value_date:'2026-02-30'},by))).toBe('invalid_payload');
   expect(await code(db.fieldReview(pc.field_id,'shout' as 'confirm',{},by))).toBe('invalid_action');
   expect(await db.listFields(w.rep)).toEqual(before);
   const r=await db.fieldReview(pc.field_id,'correct',{value_text:'USD',value_currency:'USD',value_unit:null},by);
   expect(r).toMatchObject({targets:1,basis:'effective'});
   const corrected=(await db.listFields(w.rep)).find(f=>f.field_id===pc.field_id)!;
   expect(corrected).toMatchObject({status:'corrected',corrected:{value_text:'USD',value_currency:'USD',value_unit:null}});
   expect(effectiveValue(corrected)).toEqual({value_text:'USD',value_num:null,value_currency:'USD',value_unit:null,value_date:null});
   expect((await db.listTargets(w.rep))[0]).toMatchObject({price_currency:'USD',upside_pct:null,upside_formula_version:null});
   expect(await code(db.insertHumanField(w.rep,{target_key:w.tk,field:'price_currency',occurrence:1,value_text:'HKD',value_num:null,value_currency:'HKD',value_unit:null,value_date:null,page:1,char_start:0,char_end:3,value_source_text:'HKD',parse_run_id:w.parse,status:'confirmed'},by))).toBe('effective_exists');
   const tp=(await db.listFields(w.rep)).find(f=>f.field==='target_price')!;
   await db.fieldReview(tp.field_id,'absent',{page:2},by);
   expect((await db.listFields(w.rep)).filter(f=>f.field==='target_price').map(f=>f.status).sort()).toEqual(['absent','rejected']);
   expect((await db.listTargets(w.rep))[0]).toMatchObject({basis:'effective',target_price:null});
   expect(await code(db.fieldReview(randomUUID(),'confirm',{},by))).toBe('field_not_found');
  });

  it('fieldReview: a corrected row can be rejected or marked absent; corrected is cleared (broker_fields_corrected_iff, P-R1-06)',async()=>{
   const w=await world();
   const pick=async(field:string)=>(await db.listFields(w.rep)).find(f=>f.field===field&&f.status==='extracted')!;
   const rating=await pick('rating');
   await db.fieldReview(rating.field_id,'correct',{value_text:'Overweight'},by);
   expect((await db.listFields(w.rep)).find(f=>f.field_id===rating.field_id)).toMatchObject({status:'corrected',corrected:{value_text:'Overweight'}});
   await db.fieldReview(rating.field_id,'reject',{},by);
   expect((await db.listFields(w.rep)).find(f=>f.field_id===rating.field_id)).toMatchObject({status:'rejected',corrected:null});
   const tp=await pick('target_price');
   await db.fieldReview(tp.field_id,'correct',{value_text:'121',value_num:'121'},by);
   await db.fieldReview(tp.field_id,'absent',{page:1},by);
   const rows=(await db.listFields(w.rep)).filter(f=>f.field==='target_price');
   expect(rows.find(f=>f.field_id===tp.field_id)).toMatchObject({status:'rejected',corrected:null});
   expect(rows.find(f=>f.status==='absent')).toMatchObject({corrected:null});
  });

  it('insertHumanField and upsertTargetOverride go through materialize',async()=>{
   const w=await world();
   const out=await db.insertHumanField(w.rep,{target_key:null,field:'sector',occurrence:1,value_text:'Internet',value_num:null,value_currency:null,value_unit:null,value_date:null,page:2,char_start:0,char_end:8,value_source_text:'Internet',parse_run_id:w.parse,status:'confirmed'},by);
   expect(out.receipt.targets).toBe(1);expect((await db.getReport(w.rep))!.sector_as_stated).toBe('Internet');
   expect(await code(db.insertHumanField(w.rep,{target_key:null,field:'sector',occurrence:2,value_text:'x',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:1,value_source_text:'x',parse_run_id:randomUUID(),status:'confirmed'},by))).toBe('invalid_payload');
   await h.stock('BABA','US');const other=await h.issuer();
   await db.upsertTargetOverride({report_id:w.rep,target_key:w.tk,security_ticker:'BABA',issuer_id:other,set_by:by,note:null});
   expect((await db.listTargets(w.rep))[0]).toMatchObject({security_ticker:'BABA',issuer_id:other});
   expect(typeof (await db.listTargets(w.rep))[0].resolution.override_id).toBe('string');
  });

  it('publishBlockers: a fresh extraction lists the reasons in spec order; a ready report has none',async()=>{
   const w=await world();
   expect(await db.publishBlockers(w.rep)).toEqual(['review_not_approved','report_incomplete:scope','report_incomplete:institution_id','required_field_missing:institution','required_field_missing:published_date','required_field_missing:title','field_pending:institution','field_pending:published_date','field_pending:title','rules_stale','restricted_value_in_text:title_original']);
   const r=await ready();
   await db.updateReportDraft(r.rep,{title_public:'Rewritten',title_public_by:by});
   expect(await db.publishBlockers(r.rep)).toEqual(['materialize_stale','restricted_value_in_text:title_public']);
   await db.materialize(r.rep);expect(await db.publishBlockers(r.rep)).toEqual(['rules_stale','restricted_value_in_text:title_public']);
   await rules(r.rep);expect(await db.publishBlockers(r.rep)).toEqual([]);
   await db.updateReportDraft(r.rep,{evidence_ok:false});expect(await db.publishBlockers(r.rep)).toEqual(['evidence_drift']);await db.updateReportDraft(r.rep,{evidence_ok:true});
   const b=await h.batch();
   const qid=String((await h.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'broker_research',table_name:'broker_research_reports',natural_key:`${r.sha}:upside_identity:${r.tk}`,reason_code:'upside_mismatch',batch_id:b,payload:{},detail:{},status:'open',resolved_by:null,resolved_at:null,created_at:new Date().toISOString()})).id);
   expect(await db.publishBlockers(r.rep)).toEqual(['quarantine_open:upside_mismatch']);
   await h.tables.update('dq_quarantine',{id:qid},{status:'resolved_accept',resolved_by:by,resolved_at:new Date().toISOString()});
   expect(await db.publishBlockers(r.rep)).toEqual([]);
   await db.setApprovedGoldCorpus(null,by);expect(await db.publishBlockers(r.rep)).toEqual(['eval_receipt_missing']);await db.setApprovedGoldCorpus(GOLD,by);
  });

  it('publish: blocked → publish_blocked with the reasons; success → snapshot, published, immutable, one claim per priced target; unpublish → revision, retract, review reopened; republish → new claim',async()=>{
   const w=await world();
   const e=await db.publish(w.rep,by).then(()=>null,x=>x as BrokerResearchDbError);
   expect(e).toMatchObject({code:'publish_blocked'});expect(e!.detail).toMatch(/^review_not_approved,/);
   const r=await ready();
   const {publicationId:pub}=await db.publish(r.rep,by);
   const p=(await db.getPublication(pub))!;
   expect(p).toMatchObject({report_id:r.rep,revision:1,licence_version:1,published_by:by,unpublished_at:null});expect(p.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
   expect((p.snapshot.report as Record<string,unknown>).status).toBe('published');expect((p.snapshot.fields as unknown[]).length).toBe(10);
   expect(await db.getReport(r.rep)).toMatchObject({status:'published',current_publication_id:pub,title_restricted:false});
   expect(await code(db.updateReportDraft(r.rep,{title_public:'x',title_public_by:by}))).toBe('published_immutable');
   expect(await code(db.fieldReview((await db.listFields(r.rep))[0].field_id,'reject',{},by))).toBe('published_immutable');
   expect(await code(db.materialize(r.rep))).toBe('published_immutable');
   expect(await code(db.publish(r.rep,by))).toBe('report_not_draft');
   await db.updateReportDraft(r.rep,{evidence_ok:true});                                        // allowed (unchanged)
   const regs=(await h.outbox()).filter(x=>x.kind==='claim.register'&&(x.payload.source as Record<string,unknown>|undefined)?.publication_id===pub);
   expect(regs).toHaveLength(1);
   expect(regs[0].payload).toMatchObject({claim_key:`broker_target_price:${pub}:${r.tk}`,claim_seq:1,methodology_version:CLAIM_METHODOLOGY_VERSION,subject:{security_ticker:r.tk,market:'HK',currency:'HKD'},claim:{direction:1,target_price:'120',reference_price:'100'},source:{snapshot_hash:p.snapshot_hash}});
   expect(await code(db.unpublish(r.rep,by,' '))).toBe('reason_required');
   await db.unpublish(r.rep,by,'owner request');
   expect(await db.getReport(r.rep)).toMatchObject({status:'draft',revision:2,current_publication_id:null,review_status:'in_review'});
   expect(await db.getPublication(pub)).toMatchObject({unpublish_reason:'owner request'});
   const ret=(await h.outbox()).filter(x=>x.kind==='claim.retract'&&x.payload.claim_key===`broker_target_price:${pub}:${r.tk}`);
   expect(ret.map(x=>[x.payload.claim_seq,x.payload.reason])).toEqual([[2,'unpublish']]);
   await db.updateReportDraft(r.rep,{review_status:'approved'});
   const {publicationId:pub2}=await db.publish(r.rep,by);
   expect((await db.getPublication(pub2))!.revision).toBe(2);
   await db.updateReportDraft(r.rep,{disclosure_ok:false});
   expect((await h.outbox()).filter(x=>x.kind==='claim.retract'&&(x.payload.claim_key as string).includes(pub2)).map(x=>x.payload.reason)).toEqual(['disclosure_ok']);
   await db.updateDocument(r.doc,{status:'withdrawn',withdrawn_at:new Date().toISOString(),withdrawn_reason:'gone'});
   expect((await db.getReport(r.rep))!.status).toBe('withdrawn');
   expect((await h.outbox()).filter(x=>x.kind==='claim.retract'&&(x.payload.claim_key as string).includes(pub2))).toHaveLength(1);
  });

  it('snippets and summaries: approval gates; a material licence change drafts them and flags the report',async()=>{
   const w=await world({licence:{snippet_max_chars:10}});const lic=w.lic.licence_id;
   const sn=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:11,text:'01234567890',field_id:null,disclosure_check:PASS_CHECK,created_by:by});
   expect(await code(db.setSnippetStatus(sn,{status:'approved',approved_by:by}))).toBe('snippet_too_long');
   const ok=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:5,text:'short',field_id:null,disclosure_check:{...PASS_CHECK,passed:false},created_by:by});
   expect(await code(db.setSnippetStatus(ok,{status:'approved',approved_by:by}))).toBe('disclosure_failed');
   await db.setSnippetStatus(ok,{status:'approved',approved_by:by,disclosure_check:PASS_CHECK});
   expect((await db.listSnippets(w.rep)).find(s=>s.snippet_id===ok)).toMatchObject({status:'approved',approved_by:by,draft_reason:null});
   expect(await db.getSnippet(ok)).toMatchObject({snippet_id:ok,report_id:w.rep,text:'short'});expect(await db.getSnippet(randomUUID())).toBeNull();
   const dg=(await db.getReport(w.rep))!.summary_input_digest!;
   const su=await db.insertSummary({report_id:w.rep,lang:'en',kind:'independent_summary',run_id:w.ext,input_hash:dg,summary_md:'S',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft'});
   const stale=await db.insertSummary({report_id:w.rep,lang:'zh',kind:'independent_summary',run_id:w.ext,input_hash:hex64(),summary_md:'S',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft'});
   expect(await code(db.setSummaryStatus(stale,{status:'approved',approved_by:by}))).toBe('summary_stale');
   expect(await code(db.setSummaryStatus(su,{status:'approved',approved_by:by,disclosure_check:{...PASS_CHECK,passed:false}}))).toBe('disclosure_failed');   // the fresh check replaces the stored one
   await db.setSummaryStatus(su,{status:'approved',approved_by:by,disclosure_check:{...PASS_CHECK,inputs_hash:'1'.repeat(64)}});
   expect(await db.getSummary(su)).toMatchObject({status:'approved',disclosure_check:{inputs_hash:'1'.repeat(64)},draft_reason:null});expect(await db.getSummary(randomUUID())).toBeNull();
   await db.updateLicence(lic,{allows_public_target_price:false});
   expect((await db.listSnippets(w.rep)).find(s=>s.snippet_id===ok)).toMatchObject({status:'draft',approved_by:null,approved_at:null,draft_reason:'licence_version'});
   expect((await db.listSummaries(w.rep)).find(s=>s.summary_id===su)).toMatchObject({status:'draft',draft_reason:'licence_version'});
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(false);
   expect((await h.outbox()).some(e=>e.kind==='licence.changed'&&e.payload.licence_id===lic&&e.payload.version===2)).toBe(true);
  });

  it('entities: close-only rating scales; an analyst disclosure change flags bound reports and drafts their approved texts',async()=>{
   const inst=await db.upsertInstitution({name_en:`Entity Inst ${randomUUID()}`,name_zh:'机构',aliases:['EI'],kind:null,rating_disclosure_url:null});
   await db.upsertInstitution({institution_id:inst,aliases:['Entity Institute']} as Parameters<BrokerResearchDb['upsertInstitution']>[0]);
   expect((await db.listInstitutions()).find(i=>i.institution_id===inst)).toMatchObject({name_en:expect.stringMatching(/^Entity Inst /),name_zh:'机构',aliases:['Entity Institute']});
   expect(await code(db.upsertInstitution({name_en:(await db.listInstitutions()).find(i=>i.institution_id===inst)!.name_en.toUpperCase(),name_zh:null,aliases:[],kind:null,rating_disclosure_url:null}))).toBe('duplicate_key');
   const sc=await db.insertRatingScale({institution_id:inst,raw_label:'Buy',normalized:'buy',source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by});
   expect(await code(db.insertRatingScale({institution_id:inst,raw_label:'BUY',normalized:'sell',source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by}))).toBe('duplicate_key');
   await db.closeRatingScale(sc,'2025-01-01',by);
   expect((await db.listRatingScales(inst))[0]).toMatchObject({valid_to:'2025-01-01',closed_by:by});
   expect(await code(db.closeRatingScale(sc,'2026-01-01',by))).toBe('scale_closed');
   const w=await world();
   const af=(await db.insertHumanField(w.rep,{target_key:null,field:'analyst',occurrence:1,value_text:'Ann',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:3,value_source_text:'Ann',parse_run_id:w.parse,status:'confirmed'},by)).fieldId;
   const an=await db.upsertAnalyst({institution_id:inst,display_name:'Ann',name_variants:[],public_display:false});
   expect(await code(db.bindAnalyst({report_id:w.rep,analyst_id:an,role:null,field_id:(await db.listFields(w.rep)).find(f=>f.field==='title')!.field_id}))).toBe('analyst_field_mismatch');
   await db.bindAnalyst({report_id:w.rep,analyst_id:an,role:'lead',field_id:af});
   expect(await db.listReportAnalysts(w.rep)).toEqual([{report_id:w.rep,analyst_id:an,role:'lead',field_id:af}]);
   await db.updateReportDraft(w.rep,{institution_id:inst});
   expect((await db.listReports({institutionId:inst})).map(r=>r.report_id)).toEqual([w.rep]);
   const sn=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:4,text:'abcd',field_id:null,disclosure_check:PASS_CHECK,created_by:by});
   await db.setSnippetStatus(sn,{status:'approved',approved_by:by});
   await db.upsertAnalyst({analyst_id:an,institution_id:inst,display_name:'Ann',name_variants:[],public_display:false});      // unchanged → no cascade
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(true);
   await db.upsertAnalyst({analyst_id:an,institution_id:inst,display_name:'Ann',name_variants:['A. N.'],public_display:false});
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(false);
   expect((await db.listSnippets(w.rep)).find(s=>s.snippet_id===sn)).toMatchObject({status:'draft',draft_reason:'analyst_disclosure'});
   expect((await db.listAnalysts(inst)).map(a=>a.analyst_id)).toEqual([an]);
  });

  it('a new analyst binding drafts approved texts; approvals carry the disclosure digest and a stale supplied digest is refused (P-R1-04)',async()=>{
   const w=await world();
   const inst=await db.upsertInstitution({name_en:`Bind Inst ${randomUUID()}`,name_zh:null,aliases:[],kind:null,rating_disclosure_url:null});
   const af=(await db.insertHumanField(w.rep,{target_key:null,field:'analyst',occurrence:1,value_text:'Bo',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:2,value_source_text:'Bo',parse_run_id:w.parse,status:'confirmed'},by)).fieldId;
   const an=await db.upsertAnalyst({institution_id:inst,display_name:'Bo Private',name_variants:[],public_display:false});
   const d0=await db.disclosureDigest(w.rep);
   const sn=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:4,text:'abcd',field_id:null,disclosure_check:null,created_by:by});
   await db.setSnippetStatus(sn,{status:'approved',approved_by:by,disclosure_check:{...PASS_CHECK,db_digest:d0}});
   expect((await db.getSnippet(sn))!.disclosure_check).toMatchObject({db_digest:d0});
   await db.bindAnalyst({report_id:w.rep,analyst_id:an,role:null,field_id:af});
   expect(await db.getSnippet(sn)).toMatchObject({status:'draft',draft_reason:'analyst_disclosure'});
   expect(await db.disclosureDigest(w.rep)).not.toBe(d0);
   expect(await code(db.setSnippetStatus(sn,{status:'approved',approved_by:by,disclosure_check:{...PASS_CHECK,db_digest:d0}}))).toBe('disclosure_inputs_changed');
   await db.setSnippetStatus(sn,{status:'approved',approved_by:by,disclosure_check:{...PASS_CHECK,db_digest:await db.disclosureDigest(w.rep)}});
   expect((await db.getSnippet(sn))!.status).toBe('approved');
  });

  it('summaryCommit / titleCommit: fenced on the lease, run finished in the same write; a lost lease writes nothing (P-R1-09)',async()=>{
   const w=await world();
   const run=async(kind:'summary'|'translate')=>{const id=randomUUID();await db.insertRun({run_id:id,document_id:w.doc,kind,parse_run_id:w.parse,extractor_version:null,artifact_path:null,artifact_hash:null,model_id:'m-test',registry_hash:'r'.repeat(64),prompt_version:'p',schema_version:null,code_version:'t',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});return id;};
   const dg=(await db.getReport(w.rep))!.summary_input_digest!;
   const row={report_id:w.rep,lang:'en' as const,input_hash:dg,summary_md:'S',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft' as const};
   const s1=await run('summary');
   const id=await db.summaryCommit(w.doc,w.token,s1,row);
   expect(await db.getSummary(id)).toMatchObject({run_id:s1,status:'draft'});expect(await db.getRun(s1)).toMatchObject({status:'succeeded'});
   const t1=await run('translate');
   expect(await db.titleCommit(w.doc,w.token,t1,{title_zh:'标题',title_en:'Title'})).toBe('ok');
   expect(await db.getReport(w.rep)).toMatchObject({title_zh:'标题',title_en:'Title',title_run_id:t1});
   const s2=await run('summary');const t2=await run('translate');
   expect(await code(db.summaryCommit(w.doc,randomUUID(),s2,row))).toBe('lease_lost');               // taken over
   await h.expireLease(w.doc);
   expect(await code(db.summaryCommit(w.doc,w.token,s2,row))).toBe('lease_lost');                    // expired
   expect(await code(db.titleCommit(w.doc,w.token,t2,{title_zh:'x',title_en:'y'}))).toBe('lease_lost');
   expect((await db.listSummaries(w.rep)).map(s=>s.summary_id)).toEqual([id]);
   expect(await db.getReport(w.rep)).toMatchObject({title_zh:'标题',title_run_id:t1});
   expect(await db.getRun(s2)).toMatchObject({status:'running'});
  });

  it('disclosureRecheck: a licence change flags the report; current passing checks restore it; a stale digest or failing title is refused (P-R1-08)',async()=>{
   const w=await world();
   await db.updateLicence(w.lic.licence_id,{allows_public_target_price:false});
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(false);
   const r=(await db.getReport(w.rep))!;const dg=await db.disclosureDigest(w.rep);
   const titles=Object.fromEntries((['title_original','title_public','title_zh','title_en'] as const).filter(k=>r[k]!==null).map(k=>[k,PASS_CHECK]));
   expect(await code(db.disclosureRecheck(w.rep,by,{expected_digest:'0'.repeat(64),titles,snippets:{},summaries:{}}))).toBe('disclosure_inputs_changed');
   expect(await db.disclosureRecheck(w.rep,by,{expected_digest:dg,titles:{...titles,title_original:{...PASS_CHECK,passed:false}},snippets:{},summaries:{}})).toEqual({restored:false,failures:['restricted_value_in_text:title_original']});
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(false);
   expect(await db.disclosureRecheck(w.rep,by,{expected_digest:dg,titles,snippets:{},summaries:{}})).toEqual({restored:true,failures:[]});
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(true);
  });

  it('disclosureRecheck: an approved snippet or summary without a supplied check fails on draft and published reports; nothing changes (P-R2-01)',async()=>{
   const r=await ready();
   const sn=await db.insertSnippet({report_id:r.rep,target_key:null,purpose:'thesis',parse_run_id:r.parse,page:1,char_start:0,char_end:4,text:'abcd',field_id:null,disclosure_check:null,created_by:by});
   await db.setSnippetStatus(sn,{status:'approved',approved_by:by,disclosure_check:PASS_CHECK});
   const dg0=(await db.getReport(r.rep))!.summary_input_digest!;
   const su=await db.insertSummary({report_id:r.rep,lang:'en',kind:'independent_summary',run_id:r.ext,input_hash:dg0,summary_md:'S',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft'});
   await db.setSummaryStatus(su,{status:'approved',approved_by:by,disclosure_check:PASS_CHECK});
   const titlesOf=async()=>{const x=(await db.getReport(r.rep))!;return Object.fromEntries((['title_original','title_public','title_zh','title_en'] as const).filter(k=>x[k]!==null).map(k=>[k,PASS_CHECK]));};
   const attempt=async(o:{snippets:Record<string,typeof PASS_CHECK>;summaries:Record<string,typeof PASS_CHECK>})=>db.disclosureRecheck(r.rep,by,{expected_digest:await db.disclosureDigest(r.rep),titles:await titlesOf(),...o});
   for(const phase of ['draft','published'] as const){
    if(phase==='published'){await db.materialize(r.rep);await rules(r.rep);await db.publish(r.rep,by);}
    await db.setReportFlags(r.rep,{disclosure_ok:false});
    const before=JSON.stringify([await db.getSnippet(sn),await db.getSummary(su)]);
    expect(await attempt({snippets:{},summaries:{[su]:PASS_CHECK}})).toEqual({restored:false,failures:[`restricted_value_in_text:snippet:${sn}`]});
    expect(await attempt({snippets:{[sn]:PASS_CHECK},summaries:{}})).toEqual({restored:false,failures:['restricted_value_in_text:summary:en']});
    expect((await db.getReport(r.rep))!.disclosure_ok).toBe(false);
    expect(JSON.stringify([await db.getSnippet(sn),await db.getSummary(su)])).toBe(before);
    expect(await attempt({snippets:{[sn]:PASS_CHECK},summaries:{[su]:PASS_CHECK}})).toEqual({restored:true,failures:[]});
   }
  });

  it('initial withdrawal and requested intent are one operation (P-R6-01)',async()=>{
   const w=await world();await db.withdrawWithIntent(w.doc,'atomic',true,by);
   expect(await db.getDocument(w.doc)).toMatchObject({status:'withdrawn',withdrawn_at:expect.any(String),withdrawn_reason:'atomic',purge_requested_at:expect.any(String),purge_requested_by:by});
  });

  it('bucket-write inventory: register before bytes, finish, per-document listing, unreconciled rows of purge-intent documents in retry order; pending cannot reconcile (P-R6-01..03)',async()=>{
   const w=await world();
   const a=await db.registerWrite({document_id:w.doc,path:`runs/${randomUUID()}.request.json`,writer:'extract'});
   const b=await db.registerWrite({document_id:w.doc,path:`reports/${w.sha}.pages.${w.parse}/`,writer:'f3'});
   expect((await db.pendingWritesFor(w.doc)).map(x=>x.write_id)).toEqual([a,b]);
   await db.finishWrite(a);await db.finishWrite(a);                                            // idempotent
   expect((await db.pendingWritesFor(w.doc)).map(x=>x.write_id)).toEqual([b]);
   expect((await db.writesFor(w.doc)).map(x=>[x.write_id,x.status])).toEqual([[a,'done'],[b,'pending']]);
   expect((await db.unreconciledWrites(500)).some(x=>x.document_id===w.doc)).toBe(false);     // the document is not withdrawn
   await db.withdrawWithIntent(w.doc,'t',false,by);
   expect(await db.getDocument(w.doc)).toMatchObject({status:'withdrawn',withdrawn_reason:'t',purge_requested_at:null,purge_requested_by:null});
   expect((await db.unreconciledWrites(500)).some(x=>x.document_id===w.doc)).toBe(false);
   await db.withdrawWithIntent(w.doc,'retry',true,by);
   expect(await db.getDocument(w.doc)).toMatchObject({status:'withdrawn',withdrawn_reason:'t',purge_requested_at:expect.any(String),purge_requested_by:by});
   await db.markReconciled(b,new Date().toISOString()); // pending must not reconcile
   const mine=(await db.unreconciledWrites(500)).filter(x=>x.document_id===w.doc);
   expect(mine.map(x=>x.write_id).sort()).toEqual([a,b].sort());
   await db.markReconciled(a,new Date().toISOString());
   expect((await db.unreconciledWrites(500)).filter(x=>x.document_id===w.doc).map(x=>x.write_id)).toEqual([b]);
   expect((await db.writesFor(w.doc)).find(x=>x.write_id===a)).toMatchObject({status:'reconciled',reconciled_at:expect.any(String)});
   const abandoned=await db.registerWrite({document_id:w.doc,path:`runs/${randomUUID()}.response.json`,writer:'extract'});
   await db.abandonWrite(abandoned);await db.finishWrite(abandoned);await db.markReconciled(abandoned,new Date().toISOString());
   expect((await db.writesFor(w.doc)).find(x=>x.write_id===abandoned)).toMatchObject({status:'abandoned',finished_at:null,reconciled_at:null});
   expect((await db.unreconciledWrites(500)).some(x=>x.write_id===abandoned)).toBe(false);
   await db.retryWrite(b,'2099-01-01T00:00:00.000Z',3);
   expect((await db.unreconciledWrites(500)).some(x=>x.write_id===b)).toBe(false);
   expect((await db.writesFor(w.doc)).find(x=>x.write_id===b)).toMatchObject({status:'pending',attempts:3,next_attempt_at:'2099-01-01T00:00:00.000Z'});
   await db.retryWrite(b,'2000-01-01T00:00:00.000Z',3);
   expect((await db.unreconciledWrites(500)).some(x=>x.write_id===b)).toBe(true);
  });

  it('setReportFlags on draft and published; verifyCandidates order; quarantineResolve; purgeReportText after withdraw',async()=>{
   const w=await world();
   await db.setReportFlags(w.rep,{evidence_ok:false});expect((await db.getReport(w.rep))!.evidence_ok).toBe(false);await db.setReportFlags(w.rep,{evidence_ok:true});
   const r=await ready();const {publicationId:pub}=await db.publish(r.rep,by);
   await db.setReportFlags(r.rep,{evidence_ok:false});                                          // allowed on published; the trigger retracts
   expect(await db.getReport(r.rep)).toMatchObject({status:'published',evidence_ok:false});
   expect((await h.outbox()).filter(x=>x.kind==='claim.retract'&&(x.payload.claim_key as string).includes(pub)).map(x=>x.payload.reason)).toEqual(['evidence_ok']);
   const r2=await ready();await db.publish(r2.rep,by);
   await db.updateDocument(r.doc,{last_verified_at:'2026-01-02T00:00:00.000Z',verify_status:'ok'});
   const cands=(await db.verifyCandidates(100000)).map(d=>d.document_id);
   expect(cands).toContain(r.doc);expect(cands).toContain(r2.doc);expect(cands).not.toContain(w.doc);   // drafts are never verified
   expect(cands.indexOf(r2.doc)).toBeLessThan(cands.indexOf(r.doc));                            // never verified first
   const q=async(rule:string,reason:string)=>String((await h.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'broker_research',table_name:'broker_research_reports',natural_key:`${w.sha}:${rule}:-`,reason_code:reason,batch_id:await h.batch(),payload:{published_date:'2026-03-05'},detail:{},status:'open',resolved_by:null,resolved_at:null,created_at:new Date().toISOString()})).id);
   const pv=await q('possible_version','possible_version');
   expect(await db.quarantineResolve(pv,'resolved_reject',by,{})).toBe('resolved');
   expect(await db.quarantineResolve(pv,'resolved_reject',by,{})).toBe('already_resolved');
   expect(await db.quarantineResolve(randomUUID(),'resolved_accept',by,{})).toBe('not_found');
   expect((await db.getReport(w.rep))!.review_status).toBe('rejected');
   const left=await q('date_order','date_order');
   expect(await code(db.purgeReportText(w.rep,'fields_text'))).toBe('report_not_withdrawn');
   const sn=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:4,text:'abcd',field_id:null,disclosure_check:PASS_CHECK,created_by:by});
   await db.updateDocument(w.doc,{status:'withdrawn',withdrawn_at:new Date().toISOString(),withdrawn_reason:'purge'});
   const nFields=(await db.listFields(w.rep,{includeSuperseded:true})).length;
   expect(await db.purgeReportText(w.rep,'fields_text')).toBe(nFields);
   expect((await db.listFields(w.rep,{includeSuperseded:true})).every(f=>f.value_source_text===null&&f.corrected===null&&f.status==='rejected')).toBe(true);
   expect(await db.purgeReportText(w.rep,'snippets_text')).toBe(1);expect(await db.getSnippet(sn)).toMatchObject({text:null,status:'rejected'});
   expect(await db.purgeReportText(w.rep,'summaries')).toBe(0);
   expect(await db.purgeReportText(w.rep,'quarantine_payload')).toBe(2);
   expect((await h.tables.select('dq_quarantine',{id:left}))[0].payload).toEqual({});
  });

  it('outbox attempts, purge steps, access log, eval receipts, review queue',async()=>{
   const l=await db.updateLicence((await db.insertLicence(licenceInput())).licence_id,{holder:'Other'});
   const ev=(await h.outbox()).find(e=>e.kind==='licence.changed'&&e.payload.licence_id===l.licence_id)!;
   const pending=(await h.outbox()).filter(e=>e.status==='pending');
   expect(ev.status).toBe('pending');
   expect((await db.takePendingOutbox(pending.length)).some(e=>e.event_id===ev.event_id)).toBe(true);
   for(let i=0;i<9;i++)await db.markOutbox(ev.event_id,{delivered:false,error:'boom'});
   expect((await h.outbox()).find(e=>e.event_id===ev.event_id)).toMatchObject({status:'pending',attempts:9});
   await db.markOutbox(ev.event_id,{delivered:false,error:'boom'});
   expect((await h.outbox()).find(e=>e.event_id===ev.event_id)).toMatchObject({status:'failed',attempts:10,last_error:'boom'});
   expect(await code(db.markOutbox(ev.event_id,{delivered:true}))).toBe('event_not_pending');
   const w=await world();
   await db.upsertPurgeStep(w.doc,'pdf',{ok:false,error:'io'});await db.upsertPurgeStep(w.doc,'pdf',{ok:true});await db.upsertPurgeStep(w.doc,'artifacts',{ok:true});
   expect((await db.purgeSteps(w.doc)).map(p=>[p.step,p.status,p.attempts,p.last_error])).toEqual([['artifacts','done',1,null],['pdf','done',2,null]]);
   await db.logAccess({document_id:w.doc,user_id:by,action:'signed_url_issued',detail:{expires_in:600}});await db.logAccess({document_id:w.doc,user_id:by,action:'text_viewed',detail:{}});
   expect((await db.listAccessLog({documentId:w.doc,limit:10})).map(a=>a.action)).toEqual(['text_viewed','signed_url_issued']);
   const dg=hex64();
   const base={corpus_kind:'synthetic' as const,corpus_hash:hex64(),behavior_digest:dg,extractor_version:'f3/1',model_id:'m',registry_hash:'r',prompt_version:'p',schema_version:'s',code_version:'t',n_docs:3,per_field:{},absence:{tp:0,fp:0,fn:0},ran_by:by};
   await db.insertEvalReceipt({...base,precision_min:0.9,recall_min:0.99,passed:false});
   const second=await db.insertEvalReceipt({...base,precision_min:0.99,recall_min:0.99,passed:true});
   expect((await db.latestEvalReceipt(dg))).toMatchObject({receipt_id:second,passed:true,precision_min:0.99});
   expect(await code(db.insertEvalReceipt({...base,precision_min:0.5,recall_min:0.99,passed:true}))).toBe('constraint_violation');
   expect((await db.reviewQueue({status:'pending',limit:10000})).some(r=>r.report_id===w.rep)).toBe(true);
  });

  it('public reads: issuer + rating filters are correlated on ONE target — X:buy + Y:sell never matches issuer=X&rating=sell (P-R4-02)',async()=>{
   const tk2=`${1000+Math.floor(Math.random()*8999)}.HK`;await h.stock(tk2,'HK');const iss2=await h.issuer();
   const w=await world({extra:()=>[
    candidate({field:'ticker',target_key:tk2,value_text:tk2.replace('.',' '),resolution:{method:'parseBrokerTicker/1',issuer_securities_row:{issuer_id:iss2,ticker:tk2,valid_from:'2000-01-01',valid_to:null}}}),
    candidate({field:'rating',target_key:tk2,value_text:'Sell'}),
    candidate({field:'target_price',target_key:tk2,value_text:'80',value_num:'80',value_unit:'price'}),
    candidate({field:'target_currency',target_key:tk2,value_text:'HK$',value_currency:'HKD'}),
    candidate({field:'price_at_report',target_key:tk2,value_text:'100',value_num:'100',value_unit:'price'}),
    candidate({field:'price_currency',target_key:tk2,value_text:'HKD',value_currency:'HKD'}),
    candidate({field:'price_as_of_date',target_key:tk2,value_text:'2026-03-04',value_date:'2026-03-04'})]});
   for(const f of (await db.listFields(w.rep)).filter(x=>x.status==='extracted'||x.status==='unverified'))await db.fieldReview(f.field_id,'confirm',{},by);
   const inst=await db.upsertInstitution({name_en:`Facet Inst ${randomUUID()}`,name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
   await db.updateReportDraft(w.rep,{institution_id:inst,scope:'multi_issuer',review_status:'approved'});
   for(const [raw_label,normalized] of [['Buy','buy'],['Sell','sell']] as const)await db.insertRatingScale({institution_id:inst,raw_label,normalized,source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by});
   await db.materialize(w.rep);await rules(w.rep);await gold(w.digest);
   expect(await db.publishBlockers(w.rep)).toEqual([]);
   await db.publish(w.rep,by);await db.setPublicEnabled(true,by);
   const ids=async(f:{issuerId?:string;rating?:NormalizedRating})=>(await db.publicReports({institutionId:inst,...f,limit:10})).map(b=>String(b.report.report_id));
   expect(await ids({issuerId:w.iss,rating:'buy'})).toEqual([w.rep]);
   expect(await ids({issuerId:iss2,rating:'sell'})).toEqual([w.rep]);
   expect(await ids({issuerId:w.iss,rating:'sell'})).toEqual([]);          // X is buy, Y is sell: no single target is X + sell
   expect(await ids({issuerId:iss2,rating:'buy'})).toEqual([]);
   expect(await ids({issuerId:iss2})).toEqual([w.rep]);expect(await ids({rating:'sell'})).toEqual([w.rep]);
   // security + currency on the same target too (the spread filter, P-R5-04)
   const facet=async(f:{securityTicker?:string;currency?:string|null;issuerId?:string})=>(await db.publicReports({institutionId:inst,...f,limit:10})).map(b=>String(b.report.report_id));
   expect(await facet({securityTicker:tk2,currency:'HKD'})).toEqual([w.rep]);
   expect(await facet({securityTicker:tk2,currency:'USD'})).toEqual([]);
   const winners=await db.spreadReports({issuerId:iss2,securityTicker:tk2,currency:'HKD',from:'2025-01-01'});
   expect(winners.map(b=>[b.report.institution_id,b.report.report_id])).toEqual([[inst,w.rep]]);
   expect(await db.spreadReports({issuerId:w.iss,securityTicker:tk2,currency:'HKD',from:'2025-01-01'})).toEqual([]);
   expect(await facet({issuerId:w.iss,securityTicker:tk2})).toEqual([]);                       // X's issuer with Y's security: no single target
   await db.setPublicEnabled(false,by);
  });

  it('currency facets and spread agree when currency columns exist but prices are absent (P-R6-06)',async()=>{
   for(const absent of [['target_price'],['target_price','price_at_report']]){
    const r=await ready();
    for(const f of await db.listFields(r.rep))if(absent.includes(f.field)){
     if(f.field==='price_at_report')await db.fieldReview(f.field_id,'correct',{value_text:'not stated',value_num:null},by);
     else await db.fieldReview(f.field_id,'absent',{page:1},by);
    }
    await db.materialize(r.rep);await rules(r.rep);await db.publish(r.rep,by);await db.setPublicEnabled(true,by);
    const expected=absent.length===2?null:'HKD';
    const detail=(await db.publicReport(r.rep))!;
    expect(detail.targets[0]).toMatchObject({target_price:null,target_currency:'HKD',price_currency:'HKD'});
    // The A4 contract checks the raw public view. D1 owns the DTO projection.
    const target=detail.targets[0];
    expect(target.target_price!==null?target.target_currency:target.price_at_report!==null?target.price_currency:null).toBe(expected);
    expect(detail.report.target_facets).toContainEqual({issuer_id:r.iss,rating:'buy',security_ticker:r.tk,currency:expected});
    const f={issuerId:r.iss,securityTicker:r.tk,currency:expected,from:'2025-01-01'};
    expect((await db.publicReports({...f,limit:10})).map(b=>b.report.report_id)).toContain(r.rep);
    // The A3 spread view excludes null currency; D1's loader is added in its own task.
    expect((await db.spreadReports(f)).map(b=>b.report.report_id)).toEqual(expected===null?[]:[r.rep]);
    expect((await db.publicReports({...f,currency:'USD',limit:10})).map(b=>b.report.report_id)).not.toContain(r.rep);
    expect(await db.spreadReports({...f,currency:'USD'})).toEqual([]);
   }
  });

  it('public reads: nothing while public_enabled=false; bundles, detail, history and institutions after; target price hidden when not public',async()=>{
   const r=await ready();await db.publish(r.rep,by);
   const t=await ready({licence:{allows_public_target_price:false}});await db.publish(t.rep,by);
   const s=await ready();
   const summary=await db.insertSummary({report_id:s.rep,lang:'en',kind:'independent_summary',run_id:s.ext,input_hash:(await db.getReport(s.rep))!.summary_input_digest!,summary_md:'Public summary',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft'});
   await db.setSummaryStatus(summary,{status:'approved',approved_by:by,disclosure_check:PASS_CHECK});
   await db.publish(s.rep,by);
   await db.setPublicEnabled(false,by);
   expect((await db.publicReports({limit:200})).some(b=>b.report.report_id===r.rep)).toBe(false);
   expect(await db.publicReport(r.rep)).toBeNull();
   await db.setPublicEnabled(true,by);
   const list=await db.publicReports({institutionId:r.inst,limit:10});
   expect(list.map(b=>b.report.report_id)).toEqual([r.rep]);
   expect(list[0]).toMatchObject({hasSummary:{zh:false,en:false},snippetCount:0,institution:{institution_id:r.inst}});
   expect(list[0].targets[0]).toMatchObject({target_key:r.tk,target_price:'120',upside_pct:'0.200000',target_price_public:true});
   expect(await db.publicReports({issuerId:r.iss,limit:10})).toHaveLength(1);
   expect(await db.publicReports({rating:'sell',institutionId:r.inst,limit:10})).toEqual([]);
   const d=(await db.publicReport(t.rep))!;
   expect(d.targets[0]).toMatchObject({target_price:null,target_currency:null,upside_pct:null,target_price_public:false,price_at_report:'100'});
   expect(d.citations.map(c=>c.field)).not.toContain('target_price');
   expect(d.citations.find(c=>c.field==='price_at_report')).toMatchObject({value_num:'100',extractor_kind:'llm'});
   const hist=await db.ratingHistory({securityTicker:r.tk,limit:10});
   expect(hist.map(x=>[x.report_id,x.prev_report_id,x.target_price])).toEqual([[r.rep,null,'120']]);
   expect((await db.publicInstitutions()).find(i=>i.institution_id===r.inst)).toMatchObject({report_count:1,last_published_date:'2026-03-05'});
   expect(list[0].report).toMatchObject({rules_version:RULES_VERSION,title_model_id:null});
   expect(await db.publicReports({institutionId:r.inst,hasSummary:true,limit:10})).toEqual([]);   // no approved summary
   expect((await db.publicReports({hasSummary:true,limit:200})).map(b=>b.report.report_id)).toContain(s.rep);
   const withoutSummary=(await db.publicReports({hasSummary:false,limit:200})).map(b=>b.report.report_id);
   expect(withoutSummary).toContain(r.rep);
   expect(withoutSummary).not.toContain(s.rep);
   expect(await db.publicAnalysts({institutionId:r.inst,limit:10})).toEqual([]);                 // no public analyst bound
   await db.setPublicEnabled(false,by);
  });
 });
}
