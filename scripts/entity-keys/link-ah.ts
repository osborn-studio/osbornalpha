/**
 * A+H linking (spec §4.2.2): rule 1 same LEI (GLEIF ISIN → OpenFIGI HK line → automatic attach at
 * the listing date), rule 2 HKEX list name match (attach_security claims only).
 *   npx tsx scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]
 * <dir> holds the HKEX files named in HKEX_LIST_FILES: ListOfSecurities.xlsx (names, categories) and the ISIN
 * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is linked only when validated (HKEX code + ISIN, or ticker-level FIGI).
 * Dry run (default): no batch, nothing written (raw evidence hashed in memory); OpenFIGI is called.
 * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b) and records an ingest batch
 * (dataset entities.ah-link) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY.
 */
import {createReadStream,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
import {filterGleifLines,subsetForLeis} from '../../src/lib/entities/identifiers/gleif';
import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
import {NAMES_VERSION} from '../../src/lib/entities/identifiers/names';
import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,groupFigiResults,mapIsins,mapTickers} from '../../src/lib/entities/identifiers/openfigi';
import {applyAhLinks,figiHitsFromResults,planAhLinks,type AhIssuer,type UniverseListing} from '../../src/lib/entities/link-ah';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.ahLink;
const USAGE='usage: link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]';
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
function bad():never{console.error(USAGE);process.exit(2);}

async function main(){
 const argv=process.argv.slice(2);
 let gleifPath:string|null=null,hkexDir:string|null=null,apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')apply=true;
  else if(argv[i]==='--gleif')gleifPath=argv[++i]??bad();
  else if(argv[i]==='--hkex')hkexDir=argv[++i]??bad();
  else bad();
 }
 if(!gleifPath||!existsSync(gleifPath)||!hkexDir||!existsSync(hkexDir))bad();
 if(apply&&!EXCH_MAP_VERIFIED){console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (verification.md)');process.exit(2);}
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 const openOwner=new Map(open.map(r=>[String(r.ticker),String(r.issuer_id)]));
 const issuers:AhIssuer[]=(await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>{
  const id=String(r.issuer_id);const tickers=open.filter(o=>String(o.issuer_id)===id).map(o=>String(o.ticker));
  return {issuer_id:id,lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null),
   aTickers:tickers.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:tickers.filter(t=>/^\d{5}\.HK$/.test(t))};
 }).filter(i=>(i.aTickers.length>0||i.usci!==null)&&i.hTickers.length===0);
 const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
 const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
 const lines:string[]=[];
 for await(const l of filterGleifLines(createInterface({input:createReadStream(gleifPath),crlfDelay:Infinity}),leis))lines.push(l);
 const subset=subsetForLeis(lines,leis);
 const hkexParses:HkexListParse[]=[];const hkexBytes=new Map<HkexFileId,Uint8Array>();
 for(const f of HKEX_LIST_FILES){
  const p=join(hkexDir,f.file);
  if(!existsSync(p))continue;
  const b=new Uint8Array(readFileSync(p));
  hkexParses.push(parseHkexList(b,f.id));hkexBytes.set(f.id,b);
 }
 const listParse=hkexParses.find(p=>p.file==='list_of_securities')??null;
 const merged=hkexParses.length?mergeHkexIsins(hkexParses):null;
 const hkexIsins=merged?.hasIsinColumn?merged.byCode:null;

 const run=async(raw:RawStore,batchId:string|null)=>{
  const gleifRaw=await raw.put({kind:'gleif',bytes:new TextEncoder().encode(subset.csv),contentType:'text/csv',meta:{purpose:'ah-link',leis:subset.byLei.size}});
  const hkexRaw=new Map<HkexFileId,{sha256:string;path:string}>();
  for(const p of hkexParses){
   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
   const st=await raw.put({kind:'hkex',bytes:hkexBytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
   hkexRaw.set(p.file,{sha256:st.sha256,path:st.path});
  }
  const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null};
  const m=await mapIsins([...new Set([...subset.byLei.values()].flat())].sort(),deps);
  const figiHits=figiHitsFromResults(issuers,subset,m.byKey);
  // OpenFIGI tickers are hints: HKEX code+ISIN validates; a ticker-level FIGI is the fallback for codes HKEX has no ISIN for
  const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
  const tickerFigi=new Map<string,string>();
  let exhausted=m.exhausted;
  if(unvalidated.length&&!exhausted){
   const t=await mapTickers(unvalidated,deps);
   exhausted=t.exhausted;
   for(const [tk,r] of t.byKey){
    if(r.status!=='ok')continue;
    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
    if(c&&c.groups.length===1)tickerFigi.set(tk,c.groups[0].figi);
   }
  }
  const listRaw=hkexRaw.get('list_of_securities');
  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,tickerFigi,
   hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
   raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
  return {plan,exhausted,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
 };
 if(!apply){
  const {plan,exhausted}=await run(memoryRawStore(),null);
  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',candidates:issuers.length,quotaExhausted:exhausted,
   attaches:plan.attaches.map(a=>({issuer_id:a.issuer_id,ticker:a.ticker,share_class:a.share_class,valid_from:a.valid_from,method:a.valid_from_method})),
   conflicts:plan.conflicts.length,claims:plan.claims.map(c=>({issuer_id:c.issuer_id,ticker:c.value})),skipped:plan.skipped.length},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'link-ah',dataset:DATASET,toolVersions:{
  gleif_subset_sha256:subset.sha256,hkex_file_sha256s:JSON.stringify(Object.fromEntries(hkexParses.map(p=>[p.file,p.sha256]))),openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,names:NAMES_VERSION,as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {result,exhausted}=await run(supabaseRawStore(admin),batchId);
  if(result)({counts,errors}=result);
  if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs skipped'}];
 }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
 finally{
  try{status=await finishBatch(tables,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
