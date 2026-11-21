// src/lib/topics/topics.integration.test.ts
// Real-PG suite for topic research (spec §4, §13.2 "数据库"). Listed in criticalSuites.
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool,type PoolClient} from 'pg';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';

import {quoteEntry,testLicence,checkPublishedExcerpt,fixtureVersion,topicsDbContract} from './db-contract';
import {freshMigratedDatabase,replayFiles} from '../documents/fresh-db';
import {emptyDraft} from './drafts';
import {readTopic} from './public-read';
import {pgTopicsDb} from './pg-db';

const enabled=!!process.env.S4_TEST_STATE;
const TABLES=['topic_settings','topics','topic_versions','topic_version_evidence','topic_drafts','topic_source_licences',
 'topic_promotions','topic_summary_runs','topic_summaries','topic_disclosure_receipts','topic_audit_log','topic_evidence_drift'];
const VIEWS=['topics_open_v','topics_public_v','topic_versions_public_v','topic_evidence_drift_public_v','topic_licence_status_public_v'];

describe.skipIf(!enabled)('topics schema',()=>{
 let pool:Pool;
 const asRole=async<T>(role:'anon'|'authenticated',fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await pool.connect();
  try{await c.query('begin');await c.query(`set local role ${role}`);return await fn(c);}
  finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 beforeAll(()=>{pool=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
 afterAll(async()=>{await pool.end();});

 it('creates every table with RLS on and no client privileges',async()=>{
  for(const t of TABLES){
   const r=await pool.query(`select relrowsecurity from pg_class where oid=('public.'||$1)::regclass`,[t]);
   expect(r.rows[0]?.relrowsecurity,t).toBe(true);
   for(const role of ['anon','authenticated'] as const)
    await expect(asRole(role,c=>c.query(`select 1 from public.${t} limit 1`)),`${role} ${t}`).rejects.toThrow(/permission denied/);
  }
 });
 it('seeds the settings row closed',async()=>{
  const r=await pool.query('select public_enabled,summary_public_enabled from public.topic_settings where id=1');
  expect(r.rows).toEqual([{public_enabled:false,summary_public_enabled:false}]);
 });
 it('gives anon nothing and authenticated zero rows while the switch is off',async()=>{
  for(const v of VIEWS){
   await expect(asRole('anon',c=>c.query(`select 1 from public.${v} limit 1`)),`anon ${v}`).rejects.toThrow(/permission denied/);
   const r=await asRole('authenticated',c=>c.query(`select count(*)::int as n from public.${v}`));
   expect(r.rows[0].n,v).toBe(0);
  }
 });
 it('rejects a bad slug and a bad category',async()=>{
  const ins=(slug:string,cat:string)=>pool.query(`insert into public.topics (topic_slug,category,created_by) values ($1,$2,gen_random_uuid())`,[slug,cat]);
  await expect(ins('Bad_Slug','macro')).rejects.toThrow(/topics_slug_shape/);
  await expect(ins('ab','macro')).rejects.toThrow(/topics_slug_shape/);
  await expect(ins('ok-slug-t11','sports')).rejects.toThrow(/topics_category/);
 });
 it('never lets a slug change',async()=>{
  const {rows}=await pool.query(`insert into public.topics (topic_slug,category,created_by) values ('slug-fixed-t11','macro',gen_random_uuid()) returning topic_id`);
  await expect(pool.query(`update public.topics set topic_slug='slug-moved-t11' where topic_id=$1`,[rows[0].topic_id])).rejects.toThrow(/slug_immutable/);
 });
});

describe.skipIf(!enabled)('topics functions',()=>{
 let pool:Pool;
 const asRole=async<T>(role:'anon'|'authenticated',fn:(c:PoolClient)=>Promise<T>,researchOwner?:string):Promise<T>=>{
  const c=await pool.connect();
  try{
   await c.query('begin');
   if(researchOwner){
    // The bare harness omits Supabase's default authenticated grants. Roll these back with the session.
    await c.query('grant usage on schema public,auth to authenticated');
    await c.query('grant select on public.research_theses,public.research_memos,public.research_source_documents,public.research_thesis_events to authenticated');
    await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[researchOwner,JSON.stringify({sub:researchOwner,role})]);
   }
   await c.query(`set local role ${role}`);return await fn(c);
  }
  finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 beforeAll(()=>{pool=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
 afterAll(async()=>{await pool.end();});

const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const ACTOR=randomUUID();
const body=(title:string)=>JSON.stringify({blocks_provenance:{},dek:{en:'',zh:''},entries:[],evidence:[],expected_slots:[],sections:[],title:{en:title,zh:title}});
const evRow=(ordinal:number,state='ok')=>({ordinal,kind:'macro_observation',ref:{v:1,kind:'macro_observation',id:randomUUID(),as_of:'2026-11-01T00:00:00.000Z'},
 ref_hash:sha(`ref-${ordinal}-${randomUUID()}`),as_of:'2026-11-01T00:00:00.000Z',state,digest:state==='ok'?sha(`d-${ordinal}`):null,section_key:'s1'});
const snapshotOf=(slug:string,rows:ReturnType<typeof evRow>[],extra:Record<string,unknown>={})=>JSON.stringify({contract_version:'evidence-ref/1',counts:{ok:rows.length},
 evidence:rows.map(r=>({ordinal:r.ordinal,ref:r.ref,ref_hash:r.ref_hash,section_key:r.section_key,
  resolved:{state:r.state,display:{fact:r.state==='ok'?{template:'topic.macro_level',slots:{value:{value_text:'4.3',unit:'pct'}}}:null},drawer:{attribution_key:'macro:attribution'}}})),
 topic:{slug,category:'macro',title:{zh:'t',en:'t'},dek:{zh:'',en:''}},...extra});
async function draftTopic(slug:string){
 const b=body(slug);
 const {rows}=await pool.query(`select public.topic_create($1,'macro',$2,$3) as r`,[slug,b,ACTOR]);
 return {topicId:rows[0].r.topic_id as string,draftHash:sha(b)};
}
async function publish(slug:string,rows=[evRow(1)],snapshotExtra:Record<string,unknown>={}){
 const t=await draftTopic(slug);
 const rc=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 const snap=snapshotOf(slug,rows,snapshotExtra);
 const r=await pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-10T00:00:00Z',$6) as r`,[t.topicId,t.draftHash,snap,JSON.stringify(rows),rc.rows[0].id,ACTOR]);
 return {...t,snap,versionId:r.rows[0].r.version_id as string,versionNo:r.rows[0].r.version_no as number};
}

it('A12/A13 leaves private research untouched through promotion and publication and blocks a source id',async()=>{
 const {promoteThesis,thesisReader}=await import('./promote');
 const {privateIds}=await import('./private-ids');
 const {checkDraft,publishTopic}=await import('./publish');
 const {scenario}=await import('./fixtures/scenario');
 const actor=randomUUID(),thesisId=randomUUID(),sourceId=randomUUID();
 const stamps={research_theses:'updated_at',research_memos:'updated_at',research_source_documents:'ingested_at',research_thesis_events:'created_at'};
 const footprint=async()=>Promise.all(Object.entries(stamps).map(async([table,stamp])=>
  (await pool.query(`select count(*)::int as n,max(${stamp})::text as stamp from public.${table} where user_id=$1`,[actor])).rows[0]));
 await pool.query('insert into auth.users(id,email) values($1,$2)',[actor,`${actor}@example.test`]);
 try{
  await pool.query("insert into public.research_theses(id,user_id,title,body) values($1,$2,'Conditions','Initial conditions')",[thesisId,actor]);
  await pool.query("insert into public.research_memos(user_id,title) values($1,'Memo')",[actor]);
  await pool.query("insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'NOTE','Source','Private text',$3)",[sourceId,actor,sha('Private text')]);
  await pool.query("insert into public.research_thesis_events(user_id,thesis_id,kind) values($1,$2,'SUPPORT')",[actor,thesisId]);
  const before=await footprint();expect(before.map(row=>row.n)).toEqual([1,1,1,1]);
  await asRole('authenticated',async c=>{
   const projection=await c.query('select title,body from public.research_theses where id=$1',[thesisId]);
   expect(projection.rows).toEqual([{title:'Conditions',body:'Initial conditions'}]);
   // Exercise the production projections against real RLS rows on this connection.
   const session={from:(table:string)=>({select:(columns:string)=>{
    if(!Object.hasOwn(stamps,table)||!/^\w+(,\w+)*$/.test(columns))throw new Error('unexpected projection');
    const sql=`select ${columns} from public.${table}`;
    return {eq:(_field:string,id:string)=>({maybeSingle:async()=>({data:(await c.query(sql+' where id=$1',[id])).rows[0]??null,error:null})}),
     order:()=>{
      const page=(after:string|null)=>({limit:async(limit:number)=>({data:(await c.query(sql+' where ($1::uuid is null or id>$1) order by id limit $2',[after,limit])).rows,error:null})});
      return {...page(null),gt:(_key:string,after:string)=>page(after)};
     }};
   }})};
   const {deps}=await scenario();deps.db=pgTopicsDb(pool);deps.privateIds=()=>privateIds(session);
   const {topic_id:topicId,promotion_id}=await promoteThesis({...deps,thesis:thesisReader(session)},{thesisId,slug:'rls-promotion',category:'macro',actor});
   const draft=(await deps.db.draftOf(topicId))!,note=draft.body.entries[0];
   if(note.entry_type!=='owner_note')throw new Error('expected promoted note');
   draft.body.blocks_provenance={title:'reviewed','entry.from-thesis':'reviewed'};
   draft.body.expected_slots=[{key:'industry',kind:'industry_metric',label:{en:'Industry',zh:'行业'},reason_code:'industry_not_published'}];
   draft.body.sections=[{key:'data',title:draft.body.title,note:null,items:[{expected_slot:'industry'}]}];
   note.body.en=sourceId;
   const saved=await deps.db.saveDraft({topicId,body:draft.body,expectedRevision:draft.revision,actor});
   expect((await checkDraft(deps,{topicId,actor})).blocked).toContain('private_reference');
   note.body.en='Reviewed conditions';
   const clean=await deps.db.saveDraft({topicId,body:draft.body,expectedRevision:saved.revision,actor});
   expect((await checkDraft(deps,{topicId,actor})).passed).toBe(true);
   await publishTopic(deps,{topicId,expectedDraftHash:clean.draft_hash,actor});
   expect((await deps.db.versionsOfTopic(topicId))[0].promotion_id).toBe(promotion_id);
  },actor);
  expect(await footprint()).toEqual(before);
 }finally{await pool.query('delete from auth.users where id=$1',[actor]);}
});

it('topic_create stores the draft hash of the text it was given and rejects a reused slug (A18)',async()=>{
 const t=await draftTopic('fn-create-a');
 const d=await pool.query('select revision,draft_hash from public.topic_drafts where topic_id=$1',[t.topicId]);
 expect(d.rows[0]).toEqual({revision:1,draft_hash:t.draftHash});
 await pool.query(`select public.topic_retire($1,'owner_request',null,$2)`,[t.topicId,ACTOR]);
 await expect(draftTopic('fn-create-a')).rejects.toThrow(/slug_taken/);
});
it('topic_save_draft enforces the expected revision',async()=>{
 const t=await draftTopic('fn-save-a');
 await pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[t.topicId,body('x'),ACTOR]);
 await expect(pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[t.topicId,body('y'),ACTOR])).rejects.toThrow(/revision_conflict/);
});
it('topic_publish writes version 1, the evidence copy and the topic pointer in one call',async()=>{
 const p=await publish('fn-publish-a',[evRow(1),evRow(2,'withheld')]);
 expect(p.versionNo).toBe(1);
 const ev=await pool.query('select ordinal,state from public.topic_version_evidence where version_id=$1 order by ordinal',[p.versionId]);
 expect(ev.rows).toEqual([{ordinal:1,state:'ok'},{ordinal:2,state:'withheld'}]);
 const t=await pool.query('select status,current_version_id from public.topics where topic_id=$1',[p.topicId]);
 expect(t.rows[0]).toEqual({status:'published',current_version_id:p.versionId});
});
it.each([
 ['a stale draft hash','publish_blocked:draft_changed',{hash:'0'.repeat(64)}],
 ['an admin projection','publish_blocked:admin_projection',{extra:{admin_only:true}}],
 ['a withheld item that still carries a fact','publish_blocked:restricted_value',{leak:true}],
 ['evidence rows that differ from the snapshot','publish_blocked:evidence_mismatch',{dropRow:true}],
] as const)('topic_publish refuses %s',async(_n,code,o)=>{
 const slug=`fn-block-${code.split(':')[1].replace(/_/g,'-')}`;
 const t=await draftTopic(slug);
 const rc=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 const rows=[evRow(1),evRow(2,'withheld')];
 let snap=snapshotOf(slug,rows,'extra' in o?o.extra:{});
 if('leak' in o){const j=JSON.parse(snap);j.evidence[1].resolved.display.fact={template:'x',slots:{}};snap=JSON.stringify(j);}
 await expect(pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-10T00:00:00Z',$6)`,
  [t.topicId,'hash' in o?o.hash:t.draftHash,snap,JSON.stringify('dropRow' in o?rows.slice(0,1):rows),rc.rows[0].id,ACTOR])).rejects.toThrow(code);
});
it('topic_publish refuses a failed receipt and a summary while the summary switch is off (D11)',async()=>{
 const t=await draftTopic('fn-block-receipt');
 const bad=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,false,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 const rows=[evRow(1)];
 await expect(pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-10T00:00:00Z',$6)`,
  [t.topicId,t.draftHash,snapshotOf('fn-block-receipt',rows),JSON.stringify(rows),bad.rows[0].id,ACTOR])).rejects.toThrow('publish_blocked:disclosure_receipt');
 const ok=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[t.topicId,t.draftHash,ACTOR]);
 await expect(pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,$7,$5,'2026-11-10T00:00:00Z',$6)`,
  [t.topicId,t.draftHash,snapshotOf('fn-block-receipt',rows),JSON.stringify(rows),ok.rows[0].id,ACTOR,randomUUID()])).rejects.toThrow('publish_blocked:summary_provider_unconfirmed');
});
it('publishes an approved summary only with provider confirmation',async()=>{
 const t=await draftTopic('fn-approved-summary'),db=pgTopicsDb(pool);
 const claim=await db.claimSummary({...t,actor:ACTOR,requestId:randomUUID(),payloadHash:sha('payload'),locale:'en',manifest:{},promptVersion:'p1',validatorVersion:'v1'});
 const rendered={facts:[],points:[],counterpoints:[],incomparable:[],prompt_version:'p1',validator_version:'v1',provider:'test',model:'test'};
 await db.finishSummary({runId:claim.run_id,state:'accepted',provider:'test',model:'test',rendered,rawOutput:{},validation:{validator_version:'v1'},finalizePayload:{}});
 const [summary]=await db.summariesOf(t.topicId,t.draftHash);
 await db.approveSummary({summaryId:summary.summary_id,decision:'approve',actor:ACTOR});
 const receiptId=await db.recordDisclosure({...t,actor:ACTOR,checks:[],passed:true,codeVersion:'test'});
 const c=await pool.connect();
 const args=[t.topicId,t.draftHash,snapshotOf('fn-approved-summary',[],{summary:rendered}),summary.summary_id,receiptId,ACTOR];
 const sql=`select public.topic_publish($1,$2,$3,'[]'::jsonb,$4,$5,now(),$6) as r`;
 try{
  await c.query('begin');
  await c.query("select pg_advisory_xact_lock(hashtext('topic_settings'))");
  await c.query('savepoint closed');
  await expect(c.query(sql,args)).rejects.toThrow('publish_blocked:summary_provider_unconfirmed');
  await c.query('rollback to closed');
  await c.query(`select public.topic_set_public_enabled(false,true,'test','{}'::jsonb,$1)`,[ACTOR]);
  expect((await c.query(sql,args)).rows[0].r.version_no).toBe(1);
 }finally{await c.query('rollback');c.release();}
});
it('preserves billing RPC overload counts and client execute privileges',async()=>{
 const functions=['reserve_llm_daily_budget','create_cap_exempt_llm_audit','begin_usage_run','finalize_usage_run'];
 for(const name of ['record_usage_event',...functions]){
  const {rows}=await pool.query(`select count(*)::int as overloads,
   count(*) filter (where has_function_privilege('anon',p.oid,'execute')
    or has_function_privilege('authenticated',p.oid,'execute'))::int as client_executable
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=$1`,[name]);
  expect(rows[0],name).toEqual({overloads:name==='record_usage_event'?0:1,client_executable:0});
 }
});
it('accepts topic_summary usage and rejects an unknown feature',async()=>{
 const c=await pool.connect(),user=randomUUID();
 try{
  await c.query('begin');
  await c.query('insert into auth.users(id,email) values($1,$2)',[user,`${user}@example.test`]);
  const sql=`insert into public.usage_events(user_id,feature,run_provider,run_model,run_byo) values ($1,$2,'test','test',false)`;
  expect((await c.query(sql,[user,'topic_summary'])).rowCount).toBe(1);
  await expect(c.query(sql,[user,'nonsense'])).rejects.toThrow(/usage_events_feature_check/);
 }finally{await c.query('rollback');c.release();}
});
it('versions are immutable except the one-time unpublish columns (A14)',async()=>{
 const p=await publish('fn-immutable-a');
 await expect(pool.query(`update public.topic_versions set cutoff=now() where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_versions/);
 await expect(pool.query(`delete from public.topic_versions where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_versions/);
 await expect(pool.query(`update public.topic_version_evidence set state='missing' where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_version_evidence/);
 await expect(pool.query(`delete from public.topic_version_evidence where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_version_evidence/);
 await pool.query(`select public.topic_unpublish($1,'error','note',$2)`,[p.topicId,ACTOR]);
 await expect(pool.query(`update public.topic_versions set unpublish_reason='privacy' where version_id=$1`,[p.versionId])).rejects.toThrow(/append_only:topic_versions/);
});
it('unpublish falls back to the previous live version, then to status unpublished',async()=>{
 const p=await publish('fn-unpublish-a');
 await pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[p.topicId,body('v2'),ACTOR]);
 const h2=sha(body('v2'));
 const rc=await pool.query(`select public.topic_record_disclosure($1,$2,'[]'::jsonb,true,'test',$3) as id`,[p.topicId,h2,ACTOR]);
 const rows=[evRow(1)];
 await pool.query(`select public.topic_publish($1,$2,$3,$4::jsonb,null,$5,'2026-11-11T00:00:00Z',$6)`,[p.topicId,h2,snapshotOf('fn-unpublish-a',rows),JSON.stringify(rows),rc.rows[0].id,ACTOR]);
 const u1=await pool.query(`select public.topic_unpublish($1,'error',null,$2) as r`,[p.topicId,ACTOR]);
 expect(u1.rows[0].r.current_version_no).toBe(1);
 const u2=await pool.query(`select public.topic_unpublish($1,'error',null,$2) as r`,[p.topicId,ACTOR]);
 expect(u2.rows[0].r.current_version_no).toBeNull();
 expect((await pool.query('select status from public.topics where topic_id=$1',[p.topicId])).rows[0].status).toBe('unpublished');
});
it('the public views open with the switch and hide unpublished snapshots (D1, D12)',async()=>{
 const p=await publish('fn-view-a');
 const lock=await pool.connect();
 try{
  await lock.query(`select pg_advisory_lock(hashtext('topic_settings'))`);
  await pool.query(`select public.topic_set_public_enabled(true,false,null,'{"macro:attribution":{"terms_url":"https://fred.stlouisfed.org/legal/","confirmed_on":"2026-11-17"}}'::jsonb,$1)`,[ACTOR]);
  const seen=await asRole('authenticated',c=>c.query(`select version_no,title_zh from public.topics_public_v where topic_slug='fn-view-a'`));
  expect(seen.rows).toEqual([{version_no:1,title_zh:'t'}]);
  await pool.query(`select public.topic_unpublish($1,'privacy',null,$2)`,[p.topicId,ACTOR]);
  const v=await asRole('authenticated',c=>c.query(`select snapshot,unpublish_reason from public.topic_versions_public_v where version_id=$1`,[p.versionId]));
  expect(v.rows).toEqual([{snapshot:null,unpublish_reason:'privacy'}]);
 }finally{
  await pool.query(`update public.topic_settings set public_enabled=false,summary_public_enabled=false,summary_provider_note=null where id=1`);
  await lock.query(`select pg_advisory_unlock(hashtext('topic_settings'))`);lock.release();
 }
});
it('opening the switch needs a confirmation for every attribution in use (§10)',async()=>{
 await publish('fn-licence-gate');
 await expect(pool.query(`select public.topic_set_public_enabled(true,false,null,'{}'::jsonb,$1)`,[ACTOR])).rejects.toThrow(/licence_confirmation_missing/);
});
it('functions are not callable by client roles',async()=>{
 for(const role of ['anon','authenticated'] as const)
  await expect(asRole(role,c=>c.query(`select public.topic_retire(gen_random_uuid(),'error',null,gen_random_uuid())`))).rejects.toThrow(/permission denied/);
});

it('records disclosure codes and promotion metadata in the audit log',async()=>{
 const t=await draftTopic('fn-audit-details');
 const checks=[{id:1,key:'refs',result:'block',codes:['missing_ref','invalid_ref'],detail:{}},
  {id:2,key:'freshness',result:'warn',codes:['stale'],detail:{}}];
 const receipt=await pool.query(`select public.topic_record_disclosure($1,$2,$3::jsonb,false,'test',$4) id`,
  [t.topicId,t.draftHash,JSON.stringify(checks),ACTOR]);
 const detail=(await pool.query(`select detail from public.topic_audit_log where topic_id=$1 and action='disclosure_check'`,[t.topicId])).rows[0].detail;
 expect(detail).toEqual({receipt_id:receipt.rows[0].id,passed:false,blocked:['missing_ref','invalid_ref']});
 const copied={title:true};const stripped={events:2};const source=randomUUID();
 const promotion=await pool.query(`select public.topic_record_promotion($1,$2,$3,$4::jsonb,$5::jsonb,$6) id`,
  [t.topicId,source,sha('source'),JSON.stringify(copied),JSON.stringify(stripped),ACTOR]);
 expect((await pool.query(`select source_kind,source_id,source_content_hash,copied,stripped from public.topic_promotions where promotion_id=$1`,[promotion.rows[0].id])).rows)
  .toEqual([{source_kind:'research_thesis',source_id:source,source_content_hash:sha('source'),copied,stripped}]);
 expect((await pool.query(`select detail from public.topic_audit_log where topic_id=$1 and action='promote'`,[t.topicId])).rows)
  .toEqual([{detail:{promotion_id:promotion.rows[0].id}}]);
});
it('retirement prevents draft writes and preserves the reason category',async()=>{
 const t=await draftTopic('fn-retired-write');
 await pool.query(`select public.topic_retire($1,'owner_request','note',$2)`,[t.topicId,ACTOR]);
 expect((await pool.query(`select status,retired_reason,retired_at from public.topics where topic_id=$1`,[t.topicId])).rows[0])
  .toEqual({status:'retired',retired_reason:'owner_request',retired_at:expect.any(Date)});
 await expect(pool.query(`select public.topic_retire($1,'error',null,$2)`,[t.topicId,ACTOR])).rejects.toThrow('topic_retired');
 await expect(pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[t.topicId,body('x'),ACTOR])).rejects.toThrow('topic_retired');
 await expect(pool.query(`select public.topic_save_draft($1,1,$2,$3)`,[randomUUID(),body('x'),ACTOR])).rejects.toThrow('not_found');
});
it('creates and updates every licence field with an audit entry',async()=>{
 const fields={source_title:'Source',publisher:'Publisher',source_url:'https://example.test/source',terms_url:'https://example.test/terms',
  terms_read_at:'2026-11-17',terms_clause:'Excerpt permitted',permits:{excerpt:true},status:'pending',note:null};
 const result=await pool.query(`select public.topic_set_licence(null,$1::jsonb,$2) id`,[JSON.stringify(fields),ACTOR]);
 const id=result.rows[0].id;
 const changed={...fields,source_title:'Changed',publisher:'Changed publisher',source_url:'https://example.test/changed',
  terms_url:'https://example.test/new-terms',terms_read_at:'2026-11-18',terms_clause:'Updated terms',permits:{excerpt:false},status:'revoked',note:'changed'};
 expect((await pool.query(`select public.topic_set_licence($1,$2::jsonb,$3) id`,[id,JSON.stringify(changed),ACTOR])).rows[0].id).toBe(id);
 expect((await pool.query(`select source_title,publisher,source_url,terms_url,terms_read_at::text,terms_clause,permits,status,note,decided_by from public.topic_source_licences where licence_id=$1`,[id])).rows)
  .toEqual([{...changed,decided_by:ACTOR}]);
 expect((await pool.query(`select detail from public.topic_audit_log where action='licence_change' and detail->>'licence_id'=$1 order by id`,[id])).rows)
  .toEqual([{detail:{licence_id:id,status:'pending'}},{detail:{licence_id:id,status:'revoked'}}]);
});
it('resumes drift without advancing the completed timestamp and clears the cursor on completion',async()=>{
 const p=await publish('fn-drift-resume');
 const before=(await pool.query(`select drift_checked_at from public.topic_settings where id=1`)).rows[0].drift_checked_at;
 const checked='2026-11-17T00:00:00.000Z';const cursor={version_id:p.versionId,ordinal:1};
 const rows=[{version_id:p.versionId,ordinal:1,drift:'revised',current_identity:{id:'new'}}];
 expect((await pool.query(`select public.topic_upsert_drift($1::jsonb,$2,false,$3::jsonb) n`,[JSON.stringify(rows),checked,JSON.stringify(cursor)])).rows[0].n).toBe(1);
 expect((await pool.query(`select drift_checked_at,drift_cursor from public.topic_settings where id=1`)).rows[0])
  .toEqual({drift_checked_at:before,drift_cursor:cursor});
 rows[0].drift='unchanged';
 expect((await pool.query(`select public.topic_upsert_drift($1::jsonb,$2,true,null) n`,[JSON.stringify(rows),checked])).rows[0].n).toBe(1);
 expect((await pool.query(`select drift_checked_at,drift_cursor from public.topic_settings where id=1`)).rows[0])
  .toEqual({drift_checked_at:new Date(checked),drift_cursor:null});
 expect((await pool.query(`select drift,current_identity,checked_at from public.topic_evidence_drift where version_id=$1`,[p.versionId])).rows)
  .toEqual([{drift:'unchanged',current_identity:{id:'new'},checked_at:new Date(checked)}]);
});
it('accepts only preview and replay verification events, including the system actor',async()=>{
 const t=await draftTopic('fn-record-event');const actor='00000000-0000-0000-0000-000000000000';
 for(const action of ['preview','replay_verify']){
  await pool.query(`select public.topic_record_event($1,$2,$3,'{"ok":true}'::jsonb)`,[t.topicId,actor,action]);
 }
 expect((await pool.query(`select actor,action,detail from public.topic_audit_log where topic_id=$1 and action in ('preview','replay_verify') order by id`,[t.topicId])).rows)
  .toEqual(['preview','replay_verify'].map(action=>({actor,action,detail:{ok:true}})));
 await expect(pool.query(`select public.topic_record_event($1,$2,'publish','{}'::jsonb)`,[t.topicId,actor])).rejects.toThrow('invalid_action');
});
it('grants every non-trigger function only to service_role, excluding the internal audit helper',async()=>{
 const functions=(await pool.query(`select p.oid::regprocedure::text signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and left(p.proname,6)='topic_' and p.prorettype <> 'trigger'::regtype`)).rows;
 expect(functions.map(f=>f.proname).sort()).toEqual(['topic_audit','topic_create','topic_save_draft','topic_record_disclosure','topic_publish',
  'topic_unpublish','topic_retire','topic_set_licence','topic_set_public_enabled','topic_record_promotion','topic_upsert_drift','topic_record_event',
  'topic_claim_summary','topic_record_summary_completion','topic_finish_summary','topic_mark_summary_finalized','topic_expire_summaries','topic_approve_summary'].sort());
 for(const f of functions){
  for(const role of ['anon','authenticated','service_role']){
   expect((await pool.query(`select has_function_privilege($1,$2,'EXECUTE') allowed`,[role,f.signature])).rows[0].allowed,
    `${role} ${f.proname}`).toBe(role==='service_role'&&f.proname!=='topic_audit');
  }
 }
 const c=await pool.connect();
 try{
  await c.query('begin');await c.query('set local role service_role');
  await c.query(`select public.topic_record_event(null,$1,'preview','{}'::jsonb)`,[ACTOR]);
  await expect(c.query(`select public.topic_audit(null,$1,'preview','{}'::jsonb)`,[ACTOR])).rejects.toThrow(/permission denied/);
 }finally{await c.query('rollback');c.release();}
});
});

// Storage contract (spec §4.9): hold the settings lock through each case and restore on failure.
describe.skipIf(!enabled)('topics storage',()=>{
 let pool:Pool,lock:PoolClient;
 let previous:boolean;
 beforeAll(()=>{pool=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
 afterAll(async()=>{await pool.end();});
 beforeEach(async()=>{
  lock=await pool.connect();
  await lock.query("select pg_advisory_lock(hashtext('topic_settings'))");
  previous=(await lock.query('select public_enabled from public.topic_settings where id=1')).rows[0].public_enabled;
 });
 afterEach(async()=>{
  if(!lock)return;
  try{await lock.query('update public.topic_settings set public_enabled=$1 where id=1',[previous]);}
  finally{try{await lock.query("select pg_advisory_unlock(hashtext('topic_settings'))");}finally{lock.release();}}
 });
 const harness=()=>({db:pgTopicsDb(pool),newId:randomUUID,
  setPublic:async(on:boolean)=>{await lock.query('update public.topic_settings set public_enabled=$1 where id=1',[on]);},
  asPublic:()=>pgTopicsDb(pool,{role:'authenticated'})});
 it('A16 masks revoked excerpts for authenticated version and replay reads',async()=>{
  await checkPublishedExcerpt(harness(),'pg-excerpt-'+randomUUID(),randomUUID());
 });
 describe('licence mask in the public views',()=>{
  const views=['topic_licence_status_public_v','topic_versions_public_v'];
  const asRole=async(role:'authenticated'|'anon',sql:string,args:unknown[]=[])=>{
   const c=await pool.connect();
   try{await c.query('begin');await c.query(`set local role ${role}`);return (await c.query(sql,args)).rows;}
   finally{await c.query('rollback');c.release();}
  };
  const raw=async(id:string)=>(await asRole('authenticated','select to_jsonb(r) as row from public.topic_versions_public_v r where r.topic_id=$1 order by r.version_no',[id])).map(r=>r.row);
  const anonDenied=async()=>{
   for(const view of views)await expect(asRole('anon',`select * from public.${view}`)).rejects.toThrow(/permission denied/);
  };
  async function publishedPair(unknown=false){
   const h=harness(),{db}=h,actor=randomUUID(),slug='mask-'+randomUUID();
   const licenceId=await db.setLicence({licenceId:null,fields:testLicence,actor});
   const draft=emptyDraft({zh:'引文',en:'Excerpt'}),t=await db.createTopic({slug,actor,category:'macro',body:draft});
   const owner={key:'note',entry_type:'owner_note' as const,body:{zh:'注',en:'Owner'}};
   const markers:string[][]=[],stored=[];
   let hash=t.draft_hash;
   for(const n of [1,2]){
    if(n===2){
     draft.title.en='Second edition';
     hash=(await db.saveDraft({topicId:t.topic_id,expectedRevision:t.revision,body:draft,actor})).draft_hash;
     expect(hash).not.toBe(t.draft_hash);
    }
    const texts=[`zebra-${randomUUID()}`,`zebra-${randomUUID()}`];markers.push(texts);
    const excerpt=quoteEntry(unknown?(n===1?randomUUID():'not-a-uuid'):licenceId,texts[0]);
    excerpt.fragments.push({...excerpt.fragments[0],text:texts[1],attribution:'Editor',url:'https://example.org/editor'});
    const f=fixtureVersion(h,slug),snapshotText=JSON.stringify({...JSON.parse(f.snapshotText),entries:[owner,excerpt]});
    const receiptId=await db.recordDisclosure({topicId:t.topic_id,draftHash:hash,actor,checks:[],passed:true,codeVersion:'test'});
    const v=await db.publish({topicId:t.topic_id,expectedDraftHash:hash,receiptId,actor,evidence:f.evidence,snapshotText,summaryId:null,cutoff:'2026-11-10T00:00:00Z'});
    stored.push((await db.versionById(v.version_id))!);
   }
   await h.setPublic(true);
   return {h,db,actor,slug,licenceId,topicId:t.topic_id,owner,markers,stored};
  }
  it.each([
   ['approved',true,true],['revoked',true,false],['approved',false,false],['pending',true,false],
  ] as const)('serves both versions for status %s and display permission %s according to the licence',async(status,display_excerpt,allowed)=>{
   const f=await publishedPair();
   await f.db.setLicence({licenceId:f.licenceId,actor:f.actor,fields:{...testLicence,status,permits:{...testLicence.permits,display_excerpt}}});
   await anonDenied();
   const rows=await raw(f.topicId);expect(rows.map(r=>r.version_no)).toEqual([1,2]);
   for(const [i,row] of rows.entries()){
    const stored=(await f.db.versionById(row.version_id))!;
    expect(stored.version_id).toBe(f.stored[i].version_id);
    expect(row.snapshot_hash).toBe(stored.snapshot_hash);
    expect(row.snapshot_hash).toBe(createHash('sha256').update(stored.snapshot_text).digest('hex'));
    for(const marker of f.markers[i]){
     expect(stored.snapshot_text).toContain(marker);expect(JSON.stringify(row).includes(marker)).toBe(allowed);
    }
    const masked={key:'quote',entry_type:'licensed_excerpt',masked:true,reason:'licence_revoked',
     attributions:[{attribution:'Author',url:'https://example.org'},{attribution:'Editor',url:'https://example.org/editor'}]};
    expect(row.snapshot).toEqual(allowed?stored.snapshot:{...stored.snapshot,entries:[f.owner,masked]});
   }
   const now=new Date(f.stored[1].published_at),d={db:f.h.asPublic(),preview:false,now:()=>now};
   for(const view of [{},{version:1},{version:2},{asOf:now.toISOString().slice(0,10)}]){
    const dto=await readTopic(d,f.slug,view),n=view.version??2;
    expect(dto.version.version_no).toBe(n);
    for(const [i,markers] of f.markers.entries())for(const marker of markers)
     expect(JSON.stringify(dto).includes(marker)).toBe(allowed&&i===n-1);
   }
   expect(await asRole('authenticated','select * from public.topic_licence_status_public_v where licence_id=$1',[f.licenceId]))
    .toEqual([{licence_id:f.licenceId,status,excerpt_allowed:allowed}]);
   if(!allowed){
    await f.db.setLicence({licenceId:f.licenceId,actor:f.actor,fields:testLicence});
    const restored=await raw(f.topicId);expect(restored.map(r=>r.snapshot)).toEqual(f.stored.map(v=>v.snapshot));
   }
  });
  it('masks unknown and malformed licence ids in the two versions',async()=>{
   const f=await publishedPair(true),rows=await raw(f.topicId);
   expect(rows.map(r=>r.version_no)).toEqual([1,2]);
   for(const [i,row] of rows.entries()){
    for(const marker of f.markers[i])expect(JSON.stringify(row)).not.toContain(marker);
    expect(row.snapshot.entries[1].masked).toBe(true);
   }
   await anonDenied();
  });
  it('returns null for an unpublished snapshot and no rows when the directory closes',async()=>{
   const f=await publishedPair();
   await f.db.unpublish({topicId:f.topicId,actor:f.actor,reason:'licence',note:null});
   expect((await raw(f.topicId)).map(r=>r.snapshot)).toEqual([f.stored[0].snapshot,null]);
   await f.h.setPublic(false);
   for(const view of views)expect(await asRole('authenticated',`select * from public.${view}`)).toEqual([]);
  });
  it('pins the ordered public columns and the source licence schema',async()=>{
   const columns=async(name:string)=>(await pool.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",[name])).rows.map(r=>r.column_name);
   // Any validity-date column must be added to the masking rule in SQL and in excerptPermitted.
   expect(await columns('topic_source_licences')).toEqual(['licence_id','source_title','publisher','source_url','terms_url','terms_read_at','terms_clause','permits','status','decided_by','decided_at','note']);
   expect(await columns(views[1])).toEqual(['version_id','topic_id','topic_slug','version_no','cutoff','published_at','supersedes_version_id','unpublished_at','unpublish_reason','snapshot_hash','snapshot']);
   expect(await columns(views[0])).toEqual(['licence_id','status','excerpt_allowed']);
  });
  it('keeps the five views select-only and the topic functions private',async()=>{
   for(const view of VIEWS)for(const role of ['anon','authenticated','service_role']){
    const r=await pool.query("select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege($1,$2,p)",[role,'public.'+view]);
    expect(r.rows,`${role} ${view}`).toEqual(role==='anon'?[]:[{p:'SELECT'}]);
   }
   for(const view of views){
    const {rows}=await pool.query('select reloptions from pg_class where oid=$1::regclass',['public.'+view]);
    expect(rows[0].reloptions).toEqual(expect.arrayContaining(['security_invoker=false','security_barrier=true']));
   }
   const f=await pool.query(`select proname from pg_proc where pronamespace='public'::regnamespace and starts_with(proname,'topic_')
    and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))`);
   expect(f.rows).toEqual([]);
  });
  it('replays the migration twice without changing definitions, options or grants',async()=>{
   const MASK_MIGRATION='supabase/migrations/20261211090000_topics_excerpt_licence_mask.sql';
   const catalog=async(db:Pool)=>({
    views:(await db.query("select relname,pg_get_viewdef(oid) as definition,reloptions from pg_class where relnamespace='public'::regnamespace and relname=any($1) order by relname",[views])).rows,
    grants:(await db.query("select grantor,grantee,table_schema,table_name,privilege_type,is_grantable,with_hierarchy from information_schema.role_table_grants where table_schema='public' and table_name=any($1) order by table_name,grantee,privilege_type,grantor",[views])).rows,
   });
   // Replayed in a private migrated database: DDL on the shared one contends with parallel suites (#283, #284).
   const fresh=await freshMigratedDatabase(JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl);
   try{
    const before=await catalog(fresh.pool);expect(before.views).toHaveLength(2);
    expect(before).toEqual(await catalog(pool));
    for(let i=0;i<2;i++){await replayFiles(fresh.pool,[MASK_MIGRATION]);expect(await catalog(fresh.pool)).toEqual(before);}
   }finally{await fresh.drop();}
  },60_000);
 });
 topicsDbContract('pg',async()=>harness());
});
