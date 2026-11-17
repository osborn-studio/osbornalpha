// src/lib/broker-research/db.test.ts
// memoryBrokerResearchDb against the shared contract; memory-only rules (clock, upside rounding);
// supabaseBrokerResearchDb wiring (rpc names and argument names, ::text column lists, error
// mapping, admin/anon client separation) over a stub client.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {FIELD_COLUMNS,sqlColumns,supabaseBrokerResearchDb,toBrokerResearchDbError} from './db';
import {cappedAnon} from './postgrest-stub';
import {brokerResearchDbContract} from './db-contract';
import {decimalCompare,memoryBrokerResearchDb,upside1} from './memory-db';
import {BrokerResearchDbError} from './types';

brokerResearchDbContract('memoryBrokerResearchDb contract',async()=>{
 const db=memoryBrokerResearchDb();
 return {db,tables:db.tables,issuer:async()=>randomUUID(),stock:async()=>{},expireLease:async id=>db.expireLease(id),outbox:async()=>db.outbox(),batch:async()=>randomUUID()};
});

describe('memory specifics',()=>{
 it('upside/1 rounds half away from zero to 6 places; decimal compare without Number',()=>{
  expect(upside1('120','100')).toBe('0.200000');expect(upside1('133.335','100')).toBe('0.333350');
  expect(upside1('99.99995','100')).toBe('-0.000001');expect(upside1('100','100')).toBe('0.000000');expect(upside1('1','0')).toBeNull();
  expect(upside1('12345678901234567890.5','12345678901234567890')).toBe('0.000000');
  expect(decimalCompare('120.0','120')).toBe(0);expect(decimalCompare('0.10','0.09')).toBe(1);
 });
 it('leases expire against the injected clock',async()=>{
  const db=memoryBrokerResearchDb();db.setNow('2026-01-01T00:00:00.000Z');
  const l=await db.insertLicence({source_label:'x',licence_kind:'other',holder:'h',terms_summary:'t',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:100,valid_from:'2020-01-01',valid_to:null});
  const sha='a'.repeat(64);const doc=randomUUID();
  await db.insertDocument({document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:1,licence_id:l.licence_id,uploaded_by:randomUUID(),original_filename:'a.pdf'});
  expect(await db.claimLease(doc,'t1',60)).toBe(true);
  db.setNow('2026-01-01T00:00:59.000Z');expect(await db.claimLease(doc,'t2',60)).toBe(false);
  db.setNow('2026-01-01T00:01:01.000Z');expect(await db.claimLease(doc,'t2',60)).toBe(true);
  expect((await db.getDocument(doc))!.lease_until).toBe('2026-01-01T00:02:01.000Z');
 });
 it('takes injected tables and clock (services pass {tables, now})',async()=>{
  const db=memoryBrokerResearchDb({now:()=>new Date('2026-05-01T08:00:00.000Z')});
  await db.setPublicEnabled(true,randomUUID());
  expect((await db.getSettings()).updated_at).toBe('2026-05-01T08:00:00.000Z');
 });
});

describe('toBrokerResearchDbError',()=>{
 it('maps raise prefixes, lease_lost, unique and check violations',()=>{
  expect(toBrokerResearchDbError({message:'publish_blocked:review_not_approved,rules_stale',code:'P0001'})).toMatchObject({code:'publish_blocked',detail:'review_not_approved,rules_stale'});
  expect(toBrokerResearchDbError({message:'lease_lost',code:'55P03'})).toMatchObject({code:'lease_lost'});
  expect(toBrokerResearchDbError({message:'duplicate key value violates unique constraint "broker_documents_sha256_uniq"',code:'23505'})).toMatchObject({code:'duplicate_key',detail:'broker_documents_sha256_uniq'});
  expect(toBrokerResearchDbError({message:'new row for relation "x" violates check constraint "broker_fields_confirmed_span"',code:'23514'})).toMatchObject({code:'constraint_violation',detail:'broker_fields_confirmed_span'});
  expect(toBrokerResearchDbError({message:'append_only:broker_report_runs rows are never deleted',code:'23514'})).toMatchObject({code:'append_only'});
  expect(toBrokerResearchDbError({message:'permission denied for table broker_outbox',code:'42501'})).toMatchObject({code:'unknown'});
  const e=new BrokerResearchDbError('x');expect(toBrokerResearchDbError(e)).toBe(e);
 });
 it('sqlColumns turns PostgREST casts into SQL',()=>{
  expect(sqlColumns('a,b:b::text,c')).toBe('a, b::text as b, c');
  expect(FIELD_COLUMNS).toContain('value_num:value_num::text');
 });
});

/** Chainable PostgREST stub: records every call; resolves rpc by name and table reads from a queue. */
function stub(o:{rpc?:Record<string,{data:unknown;error:unknown}>;rows?:unknown[]}={}){
 const calls:unknown[][]=[];const rows=[...(o.rows??[])];
 const builder=(table:string)=>{
  const b:Record<string,unknown>={};
  for(const m of ['select','insert','update','upsert','eq','is','in','like','gte','lte','lt','or','order','limit','range','single','maybeSingle'])b[m]=(...a:unknown[])=>{calls.push(['from',table,m,...a]);return b;};
  b.then=(res:(v:unknown)=>unknown,rej?:(e:unknown)=>unknown)=>Promise.resolve({data:rows.length?rows.shift():null,error:null}).then(res,rej);
  return b;
 };
 const client={rpc:(fn:string,args:unknown)=>{calls.push(['rpc',fn,args]);return Promise.resolve(o.rpc?.[fn]??{data:null,error:null});},from:builder};
 return {calls,client:client as unknown as SupabaseClient};
}
describe('supabaseBrokerResearchDb wiring',()=>{
 it('calls the RPCs with their SQL argument names and maps the receipt',async()=>{
  const s=stub({rpc:{broker_extract_commit:{data:{effectiveHash:'e',materializedHash:'e',targets:2,basis:'mixed'},error:null},broker_report_publish:{data:'pub-1',error:null}}});
  const db=supabaseBrokerResearchDb({admin:s.client});
  expect(await db.extractCommit('d','t','r',[])).toEqual({effectiveHash:'e',materializedHash:'e',targets:2,basis:'mixed'});
  expect(await db.publish('rep','u')).toEqual({publicationId:'pub-1'});
  await db.fencedUpdateDocument('d','t',{status:'parsed',current_parse_run_id:'p',releaseLease:true});
  await db.upsertTargetOverride({report_id:'rep',target_key:'9988.HK',security_ticker:'09988.HK',issuer_id:null,set_by:'u',note:null});
  await db.quarantineResolve('q','resolved_accept','u',{target_key:'9988.HK'});
  await db.finishRun('run','t',{status:'succeeded',extractor_version:'f3/1'});
  expect(s.calls.filter(c=>c[0]==='rpc')).toEqual([
   ['rpc','broker_extract_commit',{p_document_id:'d',p_lease_token:'t',p_run_id:'r',p_rows:[]}],
   ['rpc','broker_report_publish',{p_report_id:'rep',p_by:'u'}],
   ['rpc','broker_document_fenced_update',{p_document:'d',p_token:'t',p_patch:{status:'parsed',current_parse_run_id:'p'},p_release:true}],
   ['rpc','broker_target_override',{p_report_id:'rep',p_target_key:'9988.HK',p_security_ticker:'09988.HK',p_issuer_id:null,p_by:'u',p_note:null}],
   ['rpc','broker_quarantine_resolve',{p_id:'q',p_status:'resolved_accept',p_by:'u',p_payload:{target_key:'9988.HK'}}],
   ['rpc','broker_run_finish',{p_run:'run',p_token:'t',p_patch:{status:'succeeded',extractor_version:'f3/1'}}],
  ]);
 });
 it('maps an rpc error to BrokerResearchDbError and keeps private and public clients apart',async()=>{
  const s=stub({rpc:{broker_report_publish:{data:null,error:{message:'publish_blocked:rules_stale',code:'P0001'}}}});
  await expect(supabaseBrokerResearchDb({admin:s.client}).publish('r','u')).rejects.toMatchObject({name:'BrokerResearchDbError',code:'publish_blocked',detail:'rules_stale'});
  await expect(supabaseBrokerResearchDb({admin:s.client}).publicReport('r')).rejects.toMatchObject({code:'anon_client_required'});
  await expect(supabaseBrokerResearchDb({anon:s.client}).getSettings()).rejects.toMatchObject({code:'admin_client_required'});
 });
 it('reads fields with the ::text column list',async()=>{
  const s=stub({rows:[[]]});
  await supabaseBrokerResearchDb({admin:s.client}).listFields('rep');
  expect(s.calls).toContainEqual(['from','broker_report_fields','select',FIELD_COLUMNS]);
  expect(s.calls).toContainEqual(['from','broker_report_fields','is','superseded_by_run_id',null]);
 });
 it('updates only supplied columns on existing institution and analyst rows',async()=>{
  const s=stub({rows:[{institution_id:'i'},{analyst_id:'a'}]});
  const db=supabaseBrokerResearchDb({admin:s.client});
  await db.upsertInstitution({institution_id:'i',aliases:['New']} as Parameters<typeof db.upsertInstitution>[0]);
  await db.upsertAnalyst({analyst_id:'a',name_variants:['A. N.']} as Parameters<typeof db.upsertAnalyst>[0]);
  expect(s.calls).toContainEqual(['from','research_institutions','update',{aliases:['New']}]);
  expect(s.calls).toContainEqual(['from','research_analysts','update',{name_variants:['A. N.']}]);
  expect(s.calls.some(c=>c[2]==='upsert')).toBe(false);
 });
});
describe('supabase public list under a PostgREST row cap (P-R3-05)',()=>{
 it('reads every public detail child and institution across capped responses',async()=>{
  const report={report_id:'r',institution_id:'i',published_date:'2026-03-05'};
  const rows=(prefix:string)=>Array.from({length:7},(_,n)=>({report_id:'r',target_key:`${prefix}${n}`,field_id:`${prefix}${n}`,page:n+1,lang:n%2?'en':'zh',snippet_id:`${prefix}${n}`,summary_id:`${prefix}${n}`}));
  const db=supabaseBrokerResearchDb({anon:cappedAnon({
   broker_reports_public_v:[report],broker_report_targets_public_v:rows('t'),broker_report_citations_v:rows('c'),
   broker_report_snippets_public_v:rows('s'),broker_report_summaries_public_v:rows('u'),broker_analysts_public_v:rows('a'),
   research_institutions_public_v:Array.from({length:7},(_,n)=>({institution_id:n===0?'i':`i${n}`,name_en:`I${n}`})),
  },3)});
  const detail=await db.publicReport('r');
  expect([detail?.targets.length,detail?.citations.length,detail?.snippets.length,detail?.summaries.length,detail?.analysts.length]).toEqual([7,7,7,7,7]);
  expect(await db.publicInstitutions()).toHaveLength(7);
 });
 it('every matching report stays reachable through keyset pagination; child rows of a page are read completely',async()=>{
  const X='11111111-1111-4111-8111-111111111111',Y='22222222-2222-4222-8222-222222222222';
  const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const reports=Array.from({length:12},(_,i)=>({report_id:id(i+1),published_date:`2026-0${1+(i%9)}-1${i%10}`,institution_id:null,scope:'single_issuer',
   target_facets:i%3===0?[{issuer_id:Y,rating:i%2?'buy':'neutral'}]:i%5===0?[{issuer_id:X,rating:'sell'},{issuer_id:Y,rating:'buy'}]:[{issuer_id:X,rating:i%2?'buy':'neutral'}],has_summary:i%4===0}));
  const has=(r:typeof reports[number],o:{issuer_id?:string;rating?:string})=>r.target_facets.some(t=>(o.issuer_id===undefined||t.issuer_id===o.issuer_id)&&(o.rating===undefined||t.rating===o.rating));
  const targets=reports.flatMap(r=>[{report_id:r.report_id,target_key:'A'},{report_id:r.report_id,target_key:'B'}]);
  const db=supabaseBrokerResearchDb({anon:cappedAnon({broker_reports_public_v:reports,broker_report_targets_public_v:targets,broker_report_summaries_public_v:[],broker_report_snippets_public_v:[]},3)});
  const order=(xs:typeof reports)=>[...xs].sort((a,b)=>a.published_date<b.published_date?1:a.published_date>b.published_date?-1:a.report_id<b.report_id?1:-1).map(r=>r.report_id);
  const cases:[{issuerId?:string;rating?:'buy'|'sell';hasSummary?:boolean},typeof reports][]=[
   [{issuerId:X},reports.filter(r=>has(r,{issuer_id:X}))],[{rating:'buy'},reports.filter(r=>has(r,{rating:'buy'}))],[{hasSummary:true},reports.filter(r=>r.has_summary)],[{hasSummary:false},reports.filter(r=>!r.has_summary)],
   [{issuerId:X,rating:'buy'},reports.filter(r=>has(r,{issuer_id:X,rating:'buy'}))],
   [{issuerId:X,rating:'sell'},reports.filter(r=>has(r,{issuer_id:X,rating:'sell'}))]];       // the X:sell + Y:buy report matches X+sell, never X+buy via Y (P-R4-02)
  expect(cases[4][1].some(r=>r.target_facets.length===2)).toBe(false);
  for(const [filter,expected] of cases){
   const seen:string[]=[];let cursor:{publishedDate:string;reportId:string}|undefined;
   for(let guard=0;guard<20;guard++){
    const page=await db.publicReports({...filter,limit:2,cursor});
    if(!page.length)break;
    for(const b of page)expect(b.targets.map(t=>t.target_key)).toEqual(['A','B']);
    seen.push(...page.map(b=>String(b.report.report_id)));
    const last=page.at(-1)!.report;cursor={publishedDate:String(last.published_date),reportId:String(last.report_id)};
   }
   expect({filter,seen}).toEqual({filter,seen:order([...expected])});
  }
  // a page of 5 reports has 10 target rows: more than the cap of 3, still complete
  const big=await db.publicReports({limit:5});
  expect(big.flatMap(b=>b.targets)).toHaveLength(10);
 });
});
