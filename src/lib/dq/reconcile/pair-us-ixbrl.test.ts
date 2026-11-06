// src/lib/dq/reconcile/pair-us-ixbrl.test.ts
import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {makeBudget} from '../../facts/sync';
import {memoryRawStore} from '../raw-store';
import {computeInputsHash} from './inputs-hash';
import {IXBRL_PARSER_VERSION} from './ixbrl';
import {sha256Hex} from './pair-support';
import type {PairRunContext} from './pair-support';
import {fetchSecDocument,filerClass,usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
import {reconcileTables,seedPublished} from './testing';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA} from './us-sample';
import type {SampleKey,UsSample} from './us-sample';

const CIK='9990300',ACCN='0009990300-25-000001',UNLINKED='0009990300-25-000009';
const URL1=`https://www.sec.gov/Archives/edgar/data/${CIK}/000999030025000001/zix-20241231.htm`,URL2=`https://www.sec.gov/Archives/edgar/data/${CIK}/000999030025000009/zix-q.htm`;
const D={period_start:'2024-01-01',period_end:'2024-12-31'},I={period_start:null,period_end:'2024-12-31'};
const k=(concept:string,p:{period_start:string|null;period_end:string},source_concept:string,origin:SampleKey['origin']):SampleKey=>({concept,...p,unit:'USD',source_concept,origin});
const KEYS:SampleKey[]=[
 k('revenue',D,'us-gaap:Revenues','both'),               // tag fallback in the document → passed, tag_mismatch
 k('net_income_parent',D,'us-gaap:NetIncomeLoss','both'), // equal → passed
 k('total_assets',I,'us-gaap:Assets','both'),            // 5000 vs 5001 → quarantine_left
 k('equity_parent',I,'us-gaap:StockholdersEquity','both'),// two values in the document → right_ambiguous
 k('operating_income',D,'us-gaap:OperatingIncomeLoss','left'),   // xsi:nil in the document → unsupported(nil)
 k('cost_of_revenue',D,'us-gaap:CostOfRevenue','right'), // only in the document → left_missing
 k('rd_expense',D,'us-gaap:ResearchAndDevelopmentExpense','left'),// only in companyfacts → right_missing
];
const filing=(accn:string,url:string,keys:SampleKey[],o:Partial<UsSample['issuers'][0]['filings'][0]>={})=>({accn,form:'10-K',period_end:'2024-12-31',primary_document:url.split('/').pop()!,doc_url:url,is_inline_xbrl:true,submissions_category:'Large accelerated filer',raw_sha256:'a'.repeat(64),doc_sha256:'b'.repeat(64),expected_keys:keys,...o});
const sample=(filings:ReturnType<typeof filing>[]):UsSample=>({schema:US_SAMPLE_SCHEMA,generated_at:'2026-11-05T00:00:00Z',selection:'fixture/1',issuers:[{cik:CIK,ticker:'ZIX',regime:'10-K',filings}]});
const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
const ctx=(id:string,period:string)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">000${CIK}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
const nf=(name:string,c:string,v:string,extra='')=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd" ${extra}>${v}</ix:nonFraction>`;
const docOf=(assets:string)=>new TextEncoder().encode(`${H}<body><ix:header><ix:resources>${ctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}${ctx('i2','<xbrli:instant>2024-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
 +'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Large Accelerated Filer</ix:nonNumeric>'
 +nf('RevenueFromContractWithCustomerExcludingAssessedTax','d','1,000')+nf('NetIncomeLoss','d','100')+nf('Assets','i',assets)+nf('StockholdersEquity','i','2,000')+nf('StockholdersEquity','i2','2,001')
 +nf('OperatingIncomeLoss','d','','xsi:nil="true"')+nf('CostOfRevenue','d','700')+'</body></html>');

async function setup(o:{sample:UsSample;docs:Record<string,Uint8Array|number>}){
 const tables=reconcileTables();const db=memoryFactsDb(tables);
 const issuer=randomUUID();
 await tables.insert('issuers',{issuer_id:issuer,status:'active',merged_into:null,cik:CIK});
 // generation 1 carries a stale revenue; generation 2 (active) carries the full set → binding uses generation 2 only (T1)
 await seedPublished(db,{issuer,market:'US',sourceRef:ACCN,availableDate:'2025-02-15',facts:[{concept:'revenue',value:'999',...D,source_concept:'us-gaap:Revenues'}]});
 const g2=await seedPublished(db,{issuer,market:'US',sourceRef:ACCN,availableDate:'2025-02-15',mappingGen:2,facts:[
  {concept:'revenue',value:'1000',...D,source_concept:'us-gaap:Revenues'},{concept:'net_income_parent',value:'100',...D,source_concept:'us-gaap:NetIncomeLoss'},
  {concept:'total_assets',value:'5000',...I,source_concept:'us-gaap:Assets'},{concept:'equity_parent',value:'2000',...I,source_concept:'us-gaap:StockholdersEquity'},
  {concept:'operating_income',value:'300',...D,source_concept:'us-gaap:OperatingIncomeLoss'},{concept:'rd_expense',value:'50',...D,source_concept:'us-gaap:ResearchAndDevelopmentExpense'}]});
 const sampleBytes=new TextEncoder().encode(JSON.stringify(o.sample));
 const fetch=vi.fn(async(url:string)=>{const d=o.docs[url];return typeof d==='number'?new Response('',{status:d}):d?new Response(new Uint8Array(d),{status:200}):new Response('',{status:404});});   // an owned Uint8Array<ArrayBuffer> is a DOM BodyInit (TS 5.9; plan audit P10)
 const raw=memoryRawStore();
 const c:PairRunContext={db,tables,raw,now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),fetch:fetch as unknown as typeof globalThis.fetch,
  readRepoFile:async p=>{if(p!==US_SAMPLE_PATH)throw new Error(p);return sampleBytes;},batchId:randomUUID(),dryRun:false};
 const facts=new Map((await db.factsByIds(g2.factIds)).map(f=>[f.concept,f]));
 return {tables,db,issuer,c,fetch,raw,facts,sampleSha:sha256Hex(sampleBytes)};
}

describe('us.companyfacts_vs_ixbrl',()=>{
 it('is registered with its sample and parser version',()=>{
  expect(RECONCILE_PAIRS['us.companyfacts_vs_ixbrl']?.inputs).toEqual({repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA});
 });
 it('plan audit P2: restore inputs hash the CURRENT primary document — a changed document with unchanged sample bytes changes the hash; an unobtainable document is current_evidence_unavailable',async()=>{
  const docs:Record<string,Uint8Array|number>={[URL1]:docOf('5,001')};
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  const res=await pair.evaluate(s.c,m);
  const assets=s.facts.get('total_assets')!;
  const rec=randomUUID();
  await s.tables.insert('dq_reconciliations',{id:rec,dataset:'reconcile.us.companyfacts_vs_ixbrl',pair:'us.companyfacts_vs_ixbrl',natural_key:res[2].natural_key,detail:res[2].detail});
  const item={id:randomUUID(),reason_code:'reconcile_mismatch',status:'open',payload:{fact_ids:[assets.fact_id]},detail:{pair:'us.companyfacts_vs_ixbrl',latest_result:{passed:false,reconciliation_id:rec,inputs_hash:res[2].inputs_hash}}};
  expect(await inputsHashNow(s.c,item)).toBe(res[2].inputs_hash);                     // same document, same sample → same hash
  docs[URL1]=docOf('5,000');                                                           // the document changes, the sample bytes do not
  const changed=await inputsHashNow(s.c,item);
  expect(changed).not.toBe(res[2].inputs_hash);
  expect(changed).toBe(computeInputsHash({left_raw_hash:assets.raw_hash,right_sha256:sha256Hex(docOf('5,000')),gold_or_sample_sha256:s.sampleSha,parser_version:IXBRL_PARSER_VERSION}));
  docs[URL1]=404;
  await expect(inputsHashNow(s.c,item)).rejects.toThrow('current_evidence_unavailable');
 });
 it('one result per expected key: passed, tag fallback, mismatch → quarantine_left, right_ambiguous, unsupported(nil), left_missing, right_missing',async()=>{
  const docBytes=docOf('5,001');
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docBytes}});
  const pair=usCompanyfactsVsIxbrlPair();
  const [m]=await pair.members(s.c);
  expect(m.issuerId).toBe(s.issuer);
  expect(m.expectedKeys.map(x=>x.naturalKey)).toEqual(KEYS.map(x=>`${CIK}:${ACCN}:${x.concept}:${x.period_start??''}:${x.period_end}:USD`));
  const res=await pair.evaluate(s.c,m);
  expect(res.map(r=>[r.outcome,r.passed,r.action])).toEqual([
   ['compared',true,'record'],['compared',true,'record'],['compared',false,'quarantine_left'],
   ['right_ambiguous',false,'record'],['unsupported',false,'record'],['left_missing',false,'record'],['right_missing',false,'record']]);
  const docSha=sha256Hex(docBytes);
  const rev=s.facts.get('revenue')!;
  expect(res[0]).toMatchObject({left_value:'1000',right_value:'1000',left_fact_id:rev.fact_id,detail:expect.objectContaining({tag_mismatch:true,right:expect.objectContaining({sha256:docSha,locator:expect.objectContaining({name:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax'})})})});
  expect(res[0].inputs_hash).toBe(computeInputsHash({left_raw_hash:rev.raw_hash,right_sha256:docSha,gold_or_sample_sha256:s.sampleSha,parser_version:IXBRL_PARSER_VERSION}));
  expect(res[1].detail.tag_mismatch).toBeUndefined();
  const assets=s.facts.get('total_assets')!;
  expect(res[2]).toMatchObject({left_value:'5000',right_value:'5001',abs_diff:'1',left_fact_id:assets.fact_id});
  expect(res[2].item?.natural_key).toBe(`us.companyfacts_vs_ixbrl:${m.expectedKeys[2].naturalKey}:${assets.fact_id}`);
  expect(res[3].detail).toMatchObject({right:expect.objectContaining({values:['2000','2001']})});
  expect(res[4].detail.reason).toBe('nil');
  expect(s.fetch).toHaveBeenCalledTimes(1);
  expect([...s.raw.objects.keys()].some(p=>p.includes(docSha))).toBe(true);
  expect(await s.tables.select('dq_reconciliations',{pair:'sec.filer_category'})).toEqual([]);   // single producer: Task 17b
 });
 it('an open reconcile_mismatch item pins its fact; a corrected document passes and goes back to the item',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,000')}});
  const assets=s.facts.get('total_assets')!;
  const nk=`${CIK}:${ACCN}:total_assets::2024-12-31:USD`;
  await s.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_ixbrl:${nk}:${assets.fact_id}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_ixbrl'},payload:{fact_ids:[assets.fact_id]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  const res=await pair.evaluate(s.c,m);
  expect(res[2]).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:assets.fact_id});
 });
 it('an accession without a local filing is left_unlinked without fetching; 404 → unsupported(document_not_found); dry run records nothing',async()=>{
  const unlinkedKeys=KEYS.slice(0,4);
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS),filing(UNLINKED,URL2,unlinkedKeys)]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const dry:PairRunContext={...s.c,dryRun:true};
  const [m]=await pair.members(dry);
  const res=await pair.evaluate(dry,m);
  expect(res.slice(0,KEYS.length).every(r=>r.outcome==='unsupported'&&r.detail.reason==='document_not_found')).toBe(true);
  expect(res.slice(KEYS.length).map(r=>r.outcome)).toEqual(['left_unlinked','left_unlinked','left_unlinked','left_unlinked']);
  expect(s.fetch.mock.calls.map(c=>c[0])).toEqual([URL1]);
  expect(await s.tables.select('dq_reconciliations',{})).toEqual([]);
  expect(s.raw.objects.size).toBe(0);   // dry run: the 404 body went to an ephemeral store
 });
 it('is_inline_xbrl=false → every key unsupported(not_inline_xbrl), no fetch; an invalid sample refuses the run',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS,{is_inline_xbrl:false})]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  expect((await pair.evaluate(s.c,m)).every(r=>r.outcome==='unsupported'&&r.detail.reason==='not_inline_xbrl')).toBe(true);
  expect(s.fetch).not.toHaveBeenCalled();
  const bad=await setup({sample:{...sample([filing(ACCN,URL1,KEYS.slice(0,2))])},docs:{}});
  await expect(pair.members(bad.c)).rejects.toMatchObject({code:'invalid_sample_file'});
 });
 it('a 503 after retries is an execution failure (thrown, the runner fails the member), not a result',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:503}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  await expect(pair.evaluate(s.c,m)).rejects.toThrow('sec_unavailable:http_503');
  expect(s.fetch).toHaveBeenCalledTimes(3);
 },15_000);
 it('failure bodies are stored as raw evidence without query strings in metadata',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  await pair.evaluate(s.c,m);
  expect(s.raw.objects.size).toBe(2);   // the (empty) 404 body, content-addressed, plus its metadata sidecar
  const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')||p.includes('meta')).map(([,b])=>new TextDecoder().decode(b)).join('');
  expect(meta).toContain('"http_status":404');expect(meta).not.toContain('?');
  expect(JSON.stringify(s.fetch.mock.calls.map(c=>c[0]))).not.toContain('?');
 });
 it('left precision is not published (canonicalised value_text falsifies trailing zeros)',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,001')}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  const res=await pair.evaluate(s.c,m);
  expect(res[0].detail.left).toMatchObject({precision:null,precision_note:'not_retained'});
 });
 it('dry run writes nothing to the injected raw store, for a success and a failure response',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,001')}});
  const pair=usCompanyfactsVsIxbrlPair();const dry:PairRunContext={...s.c,dryRun:true};
  const [m]=await pair.members(dry);
  const res=await pair.evaluate(dry,m);
  expect(res[0].right_value).toBe('1000');expect(res[0].detail.right).toMatchObject({sha256:sha256Hex(docOf('5,001'))});
  expect(s.raw.objects.size).toBe(0);
  const bad:PairRunContext={...s.c,dryRun:true,fetch:(async()=>new Response('nope',{status:404})) as unknown as typeof fetch};
  expect(await fetchSecDocument(URL1,bad)).toEqual({status:'not_found'});
  expect(s.raw.objects.size).toBe(0);
 });
 it('enforces byte limits while streaming, without Content-Length',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
  const MB=1024*1024;let pulled=0;
  const stream=(chunks:number)=>new ReadableStream<Uint8Array>({pull(c){if(pulled>=chunks){c.close();return;}pulled++;c.enqueue(new Uint8Array(MB));}});
  const big:PairRunContext={...s.c,fetch:(async()=>new Response(stream(80),{status:200})) as unknown as typeof fetch};
  expect(await fetchSecDocument(URL1,big)).toEqual({status:'too_large'});
  expect(pulled).toBeLessThanOrEqual(52);   // cancelled shortly after 50 MB, not drained
  pulled=0;
  const fail:PairRunContext={...s.c,fetch:(async()=>new Response(stream(5),{status:404})) as unknown as typeof fetch};
  expect(await fetchSecDocument(URL1,fail)).toEqual({status:'not_found'});
  const bodies=[...s.raw.objects.entries()].filter(([p])=>!p.endsWith('.meta.json'));
  expect(bodies).toHaveLength(1);expect(bodies[0][1].byteLength).toBe(MB);
  expect([...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('')).toContain('"truncated":1');
 },30_000);
 it('stored metadata never carries a query string, even when the URL handed to the storing path has one',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
  const withQuery=`${URL1}?token=secret&x=1#frag`;
  const ok:PairRunContext={...s.c,fetch:(async()=>new Response('x',{status:404})) as unknown as typeof fetch};
  await fetchSecDocument(withQuery,ok);
  const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('');
  expect(meta).toContain('zix-20241231.htm');expect(meta).not.toMatch(/token|secret|\?|#frag/);
 });
 it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
  expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
   .toEqual(['large_accelerated','accelerated','non_accelerated','non_accelerated',null,null]);
 });
});
