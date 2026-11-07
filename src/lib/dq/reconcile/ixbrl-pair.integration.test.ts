// src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
// Spec §9.3 (critical): us.companyfacts_vs_ixbrl on real PostgreSQL with pgFactsDb + pgTableClient.
//  1. AAPL and MSFT FY2023 10-K fixtures (plan-2 companyfacts + recorded trimmed primary documents, re-keyed onto
//     synthetic CIKs/accessions) are synced and reconciled: every expected key has exactly one result row and
//     every key passes except the registered, explained exceptions (us-ixbrl-sample-v1.exceptions.json);
//  2. a synthetic issuer ZQZZ whose companyfacts revenue is injected (1001 vs the document's 1000): mismatch →
//     reconcile_mismatch item + left quarantined (one transaction) → invisible to read_facts → materialized
//     metrics drop the dependent ratio;
//  3. restore before a passing re-run → not_passing;
//  4. the right document is corrected (1001), a new cycle passes, latest_result.passed with inputs_hash equal to
//     the restore-side recomputation; a changed sample or a changed / missing primary document after the pass
//     → not_passing / current_evidence_unavailable (plan audit P2); then restore_reconciled
//     promotes the row, it is current again and the metric comes back after materialize.
// The cases share state and run in order.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../../db/pg-table-client';
import type {TableClient} from '../../db/table-client';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION,materialize} from '../../facts/derive';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,snapshotOf} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {makeBudget,runFactsSync} from '../../facts/sync';
import type {SyncDeps} from '../../facts/sync';
import type {FactsDb,RawSnapshot} from '../../facts/types';
import {startBatch} from '../batches';
import {memoryRawStore} from '../raw-store';
import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import {inputsHashNow} from './pairs';
import {runReconcile} from './run';
import type {ReconcileDeps} from './run';
import type {PairContext} from './types';
import {US_SAMPLE_PATH,buildSampleFiling,usNaturalKey} from './us-sample';
import type {UsSample} from './us-sample';

const enabled=!!process.env.S4_TEST_STATE;
const PAIR='us.companyfacts_vs_ixbrl' as const;
const ADMIN=randomUUID();
const enc=(s:string)=>new TextEncoder().encode(s);
const today=()=>new Date().toISOString().slice(0,10);

// ---- identity re-keying (bijective; keeps this suite disjoint from sync-us.integration.test.ts) ----
const rekeyCik=(cik:string)=>`99${cik}`;
const rekeyAccn=(a:string)=>{if(!/^00\d{8}-\d{2}-\d{6}$/.test(a))throw new Error(`unexpected accession ${a}`);return `99${a.slice(2)}`;};
const unkey=(nk:string)=>nk.replace(/^99(\d+):99(\d{8}-\d{2}-\d{6})/,(_m,c:string,a:string)=>`${c}:00${a}`);
function rekeyCompanyfacts(path:string,cik:string):Uint8Array{
 let t=readFileSync(path,'utf8');
 t=t.replace(/"accn"(\s*):(\s*)"(\d{10}-\d{2}-\d{6})"/g,(_m,a:string,b:string,accn:string)=>`"accn"${a}:${b}"${rekeyAccn(accn)}"`);
 const before=t;t=t.replace(new RegExp(`"cik"(\\s*):(\\s*)${cik}\\b`),(_m,a:string,b:string)=>`"cik"${a}:${b}${rekeyCik(cik)}`);
 if(t===before)throw new Error(`cik ${cik} not found in ${path}`);
 return enc(t);
}
const rekeyDoc=(path:string,cik:string)=>enc(readFileSync(path,'utf8').replaceAll(`>${cik.padStart(10,'0')}<`,`>${rekeyCik(cik).padStart(10,'0')}<`));

const REAL=[
 {ticker:'ZQAA',cik:'320193',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
 {ticker:'ZQMS',cik:'789019',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
] as const;
interface Exception{natural_key:string;outcome:string;explanation:string}
const EXCEPTIONS=JSON.parse(readFileSync('src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.exceptions.json','utf8')) as Exception[];

// ---- synthetic issuer with an injected companyfacts value ----
const ZZ={ticker:'ZQZZ',cik:'9990003',name:'ZQ Reconcile Co'};
const ZZ_ACCN='0009990003-25-000001';
const ZZ_URL=`https://www.sec.gov/Archives/edgar/data/${ZZ.cik}/${ZZ_ACCN.replace(/-/g,'')}/zq-20241231.htm`;
const cfe=(start:string|undefined,end:string,val:number)=>({...(start?{start}:{}),end,val,accn:ZZ_ACCN,fy:2024,fp:'FY',form:'10-K',filed:'2025-02-15'});
const zzCompanyfacts=()=>enc(JSON.stringify({cik:Number(ZZ.cik),entityName:ZZ.name,facts:{'us-gaap':{
 Revenues:{units:{USD:[cfe('2024-01-01','2024-12-31',1001)]}},            // injected: the filed document says 1000
 NetIncomeLoss:{units:{USD:[cfe('2024-01-01','2024-12-31',100)]}},
 Assets:{units:{USD:[cfe(undefined,'2024-12-31',5000)]}},
 StockholdersEquity:{units:{USD:[cfe(undefined,'2024-12-31',2000)]}},
}}}));
const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024">';
const zctx=(id:string,period:string)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">000${ZZ.cik}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
const znf=(name:string,c:string,v:string)=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd">${v}</ix:nonFraction>`;
const zzDoc=(revenue:string)=>enc(`${H}<body><ix:header><ix:resources>${zctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${zctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
 +'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>'
 +znf('Revenues','d',revenue)+znf('NetIncomeLoss','d','100')+znf('Assets','i','5,000')+znf('StockholdersEquity','i','2,000')+'</body></html>');

describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',()=>{
 let admin:Pool;let db:FactsDb;let tables:TableClient;
 const ids:Record<string,string>={};
 const docs=new Map<string,Uint8Array>();
 let sampleBytes:Uint8Array=new Uint8Array();let firstCycle='';let scope:{issuer_id:string;fetch_key:string}[]=[];   // widened: buildSample returns Uint8Array (plan audit P10)
 const fakeFetch=(async(url:string|URL)=>{const b=docs.get(String(url));return b?new Response(new Uint8Array(b),{status:200}):new Response('',{status:404});}) as unknown as typeof fetch;   // owned copy = DOM BodyInit
 const readRepoFile=async(p:string)=>p===US_SAMPLE_PATH?sampleBytes:new Uint8Array(readFileSync(p));
 const rdeps=():ReconcileDeps=>({db,tables,raw:memoryRawStore(),fetch:fakeFetch,readRepoFile,now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:usCompanyfactsVsIxbrlPair()}});
 const pairCtx=(over:Partial<PairContext>={}):PairContext=>({db,tables,raw:memoryRawStore(),now:()=>new Date(),budget:makeBudget(null),fetch:fakeFetch,readRepoFile,...over});
 const q=(text:string,values:unknown[]=[])=>admin.query(text,values).then(r=>r.rows);
 function buildSample(zzRevenue:string):Uint8Array{
  const v1=JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')) as UsSample;
  const issuers=v1.issuers.filter(i=>REAL.some(r=>r.cik===i.cik)).map(i=>({...i,cik:rekeyCik(i.cik),
   filings:i.filings.map(f=>({...f,accn:rekeyAccn(f.accn),doc_url:f.doc_url.replace(`/data/${i.cik}/`,`/data/${rekeyCik(i.cik)}/`).replace(f.accn.replace(/-/g,''),rekeyAccn(f.accn).replace(/-/g,''))}))}));
  const zz=buildSampleFiling({cik:ZZ.cik,accn:ZZ_ACCN,form:'10-K',period_end:'2024-12-31',primary_document:'zq-20241231.htm',doc_url:ZZ_URL,is_inline_xbrl:true,submissions_category:'Non-accelerated filer',
   companyfacts:snapshotOf(zzCompanyfacts(),{source:'edgar'}),doc:zzDoc(zzRevenue),sinceYear:2016});
  return enc(JSON.stringify({...v1,issuers:[...issuers,{cik:ZZ.cik,ticker:ZZ.ticker,regime:'10-K',filings:[zz]}]}));
 }
 const revFactId=async()=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[ids.ZZ]))[0].fact_id as string;
 const zzItem=async()=>{const r=await q(`select id,status,dataset,detail,payload from public.dq_quarantine where reason_code='reconcile_mismatch' and detail->>'pair'=$1 and payload->'fact_ids'->>0=$2`,[PAIR,await revFactId()]);expect(r).toHaveLength(1);return r[0] as {id:string;status:string;dataset:string;detail:Record<string,any>;payload:Record<string,any>};};
 const netMargin=async()=>(await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION)).find(m=>m.metric==='net_margin'&&m.duration==='12M');

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});db=pgFactsDb(admin);tables=pgTableClient(admin);
  expect((await q(`select count(*)::int as n from public.dq_reconcile_cycles where pair=$1 and status='running'`,[PAIR]))[0].n,'a foreign running cycle of this pair (contract note 14)').toBe(0);
  await q(`insert into auth.users(id,email) values($1,$2) on conflict (id) do nothing`,[ADMIN,`${ADMIN}@ixbrl.test`]);
  const provision=async(ticker:string,cik:string,name:string)=>{
   await q(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[ticker,name]);
   await q(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),name,cik]);
   const id=(await q(`select issuer_id from public.issuers where cik=$1`,[cik]))[0].issuer_id as string;
   await q(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,ticker]);
   return id;
  };
  const fixtures=new Map<string,Uint8Array>();
  for(const r of REAL){ids[r.ticker]=await provision(r.ticker,rekeyCik(r.cik),`${r.ticker} fixture copy`);fixtures.set(rekeyCik(r.cik).padStart(10,'0'),rekeyCompanyfacts(r.companyfacts,r.cik));}
  ids.ZZ=await provision(ZZ.ticker,ZZ.cik,ZZ.name);fixtures.set(ZZ.cik.padStart(10,'0'),zzCompanyfacts());
  scope=Object.entries(ids).map(([t,id])=>({issuer_id:id,fetch_key:(t==='ZZ'?ZZ.cik:rekeyCik(REAL.find(r=>r.ticker===t)!.cik)).padStart(10,'0')}));
  await db.reconcileScope('US',scope.map(x=>({...x,reasons:['test'],priority:10})));
  // isolation rests on issuerIds filtering in runFactsSync and priority 0 / no reasons after the suite (a sync's lease release overwrites next_due_at)
  await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[Object.values(ids)]);
  const deps:SyncDeps={db,tables,storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=fixtures.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'};
  const sync=await runFactsSync(deps,{market:'US',limit:10,issuerIds:Object.values(ids),dryRun:false,triggeredBy:'script',mappingGen:MAPPING_GEN});
  expect(sync.detail).toMatchObject({published:Object.keys(ids).length,failed:0});
  for(const r of REAL){
   const meta=JSON.parse(readFileSync(`${r.doc}.meta.json`,'utf8')) as {source_url:string};
   const accn=meta.source_url.split('/')[7];   // 10+2+6 digits without dashes
   docs.set(meta.source_url.replace(`/data/${r.cik}/`,`/data/${rekeyCik(r.cik)}/`).replace(accn,`99${accn.slice(2)}`),rekeyDoc(r.doc,r.cik));
  }
  docs.set(ZZ_URL,zzDoc('1,000'));
  sampleBytes=buildSample('1,000');
 },180_000);
 afterAll(async()=>{
  if(db&&scope.length>0)await db.reconcileScope('US',scope.map(x=>({...x,reasons:[],priority:0}))).catch(()=>{});
  await admin?.end();
 });

 it('every expected key gets exactly one result; AAPL/MSFT copies pass except registered exceptions; the injected ZZ revenue is quarantined, invisible and rematerialized',async()=>{
  await materialize(db,ids.ZZ,'US');
  expect((await netMargin())?.value).toBe('0.0999000999');   // 100 / 1001 before reconciliation
  const r1=await runReconcile(rdeps(),{pair:PAIR,triggeredBy:'script'});
  firstCycle=r1.cycle!.cycleId;
  expect(r1.cycle).toMatchObject({created:true,settled:true});
  expect(r1.members.every(m=>m.outcome==='done')).toBe(true);
  const rows=await q(`select natural_key,outcome,passed,issuer_id from public.dq_reconciliations where pair=$1 and cycle_id=$2`,[PAIR,firstCycle]) as {natural_key:string;outcome:string;passed:boolean;issuer_id:string}[];
  expect(rows.length).toBe(r1.cycle!.expectedTotal);
  // independent derivation: the complete (natural key → owning issuer) set from the injected, re-keyed manifest
  const injected=JSON.parse(new TextDecoder().decode(sampleBytes)) as UsSample;
  const ownerOf=(cik:string)=>cik===ZZ.cik?ids.ZZ:ids[REAL.find(r=>rekeyCik(r.cik)===cik)!.ticker];
  const expectedPairs=injected.issuers.flatMap(i=>i.filings.flatMap(f=>f.expected_keys.map(k=>`${usNaturalKey(i.cik,f.accn,k)}@${ownerOf(i.cik)}`))).sort();
  expect(expectedPairs.length).toBeGreaterThan(0);
  expect(rows.map(r=>`${r.natural_key}@${r.issuer_id}`).sort()).toEqual(expectedPairs);
  expect(new Set(rows.map(r=>r.natural_key)).size).toBe(rows.length);
  const byKey=(a:{natural_key:string},b:{natural_key:string})=>a.natural_key<b.natural_key?-1:1;
  const realFailures=rows.filter(r=>r.issuer_id!==ids.ZZ&&!r.passed).map(r=>({natural_key:unkey(r.natural_key),outcome:r.outcome==='compared'?'compared_failed':r.outcome})).sort(byKey);
  expect(realFailures).toEqual(EXCEPTIONS.map(({natural_key,outcome})=>({natural_key,outcome})).sort(byKey));
  expect(rows.filter(r=>r.issuer_id!==ids.ZZ).length).toBeGreaterThan(REAL.length*20);
  expect(r1.cycle!.status).toBe(EXCEPTIONS.some(e=>e.outcome!=='compared_failed')?'complete_with_gaps':'complete');
  const zzRows=rows.filter(r=>r.issuer_id===ids.ZZ).sort(byKey);
  expect(zzRows.map(r=>[r.natural_key.split(':')[2],r.outcome,r.passed])).toEqual([['equity_parent','compared',true],['net_income_parent','compared',true],['revenue','compared',false],['total_assets','compared',true]]);
  const item=await zzItem();
  expect(item).toMatchObject({status:'open',dataset:'facts.us'});
  expect(item.detail.hook.state).toBe('done');
  expect(item.detail.latest_result).toMatchObject({passed:false});
  expect((await q(`select status from public.financial_facts where fact_id=$1`,[await revFactId()]))[0].status).toBe('quarantined');
  const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
  expect(visible.rows.filter(r=>r.period_end==='2024-12-31')).toEqual([]);
  expect(await netMargin()).toBeUndefined();
  const metrics=await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION);
  // the quarantine hook rematerialized: without revenue no metric of ZZ is left (net_margin was present before)
  expect(metrics).toEqual([]);
 },300_000);

 it('restore is refused while the latest result is not passing',async()=>{
  const item=await zzItem();
  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
  await expect(db.restoreReconciled(item.id,batchId,await inputsHashNow(pairCtx(),item),ADMIN)).rejects.toMatchObject({code:'not_passing'});
  expect((await zzItem()).status).toBe('open');
 });

 it('a corrected right document passes in a new cycle; restore needs the current inputs hash, promotes the row and the metric returns',async()=>{
  docs.set(ZZ_URL,zzDoc('1,001'));sampleBytes=buildSample('1,001');
  const r2=await runReconcile(rdeps(),{pair:PAIR,triggeredBy:'script'});
  expect(r2.cycle).toMatchObject({created:true,settled:true});expect(r2.cycle!.cycleId).not.toBe(firstCycle);
  const item=await zzItem();
  expect(item.status).toBe('open');
  expect(item.detail.latest_result).toMatchObject({passed:true});
  const hashNow=await inputsHashNow(pairCtx(),item);
  expect(item.detail.latest_result.inputs_hash).toBe(hashNow);
  const changed=await inputsHashNow(pairCtx({readRepoFile:async p=>p===US_SAMPLE_PATH?enc(`${new TextDecoder().decode(sampleBytes)} `):new Uint8Array(readFileSync(p))}),item);
  expect(changed).not.toBe(hashNow);
  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
  await expect(db.restoreReconciled(item.id,batchId,changed,ADMIN)).rejects.toMatchObject({code:'not_passing'});
  // plan audit P2: the primary document changes after the pass while the sample bytes stay → a different current hash, restore refused
  const passedDoc=docs.get(ZZ_URL)!;docs.set(ZZ_URL,zzDoc('1,002'));
  const docChanged=await inputsHashNow(pairCtx(),item);
  expect(docChanged).not.toBe(hashNow);
  await expect(db.restoreReconciled(item.id,batchId,docChanged,ADMIN)).rejects.toMatchObject({code:'not_passing'});
  docs.delete(ZZ_URL);
  await expect(inputsHashNow(pairCtx(),item)).rejects.toThrow('current_evidence_unavailable');   // 404 now → restore stays disabled
  docs.set(ZZ_URL,passedDoc);
  expect(await inputsHashNow(pairCtx(),item)).toBe(hashNow);
  const res=await db.restoreReconciled(item.id,batchId,hashNow,ADMIN);
  expect(res).toEqual({promoted:1,skipped:[]});
  expect((await zzItem()).status).toBe('resolved_accept');
  const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
  expect(visible.rows.filter(r=>r.period_end==='2024-12-31'&&r.is_current).map(r=>r.value)).toEqual(['1001']);
  await materialize(db,ids.ZZ,'US');
  expect((await netMargin())?.value).toBe('0.0999000999');
 },300_000);
});
