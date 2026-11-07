/**
 * Fill ISIN/FIGI on open issuer_securities rows (spec §4.1): A GLEIF subset → B OpenFIGI by ISIN →
 * D HKEX lists → C OpenFIGI by ticker for rows still without a FIGI.
 *   npx tsx scripts/entity-keys/fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]
 * --stage B implies A (B queries the ISINs A selects); default all. --gleif is needed for A/B,
 * --hkex for D (files named as in HKEX_LIST_FILES; missing files are skipped).
 * Dry run (default): no ingest batch, no DB or bucket writes (raw evidence is hashed in memory);
 * OpenFIGI IS called and E1 before/after the planned writes is printed.
 * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b live check, verification.md).
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY (raises limits).
 * tsx does not load .env.local: node --env-file=.env.local --import tsx scripts/entity-keys/fill-identifiers.ts …
 */
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {selectAll,supabaseTableClient,type Row,type TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
import {coverageE1} from '../../src/lib/entities/coverage';
import {applyIdentifierPlan} from '../../src/lib/entities/identifiers/apply';
import {filterGleifLines,subsetForLeis,type GleifSubset} from '../../src/lib/entities/identifiers/gleif';
import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexIsin,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,mapIsins,mapTickers,type FigiJobResult} from '../../src/lib/entities/identifiers/openfigi';
import {planIdentifierWrites,type IdentifierPlan,type IssuerRow,type PlanInput,type SecRow,type Stage} from '../../src/lib/entities/identifiers/plan';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {makeBudget} from '../../src/lib/facts/sync';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.identifiers;
const USAGE='usage: fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--gleif-downloaded-at <ISO>] [--issuer <uuid>]... [--apply]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGES:Record<string,Stage[]>={A:['A'],B:['A','B'],C:['C'],D:['D'],all:['A','B','C','D']};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};

interface Args{gleif:string|null;gleifDownloadedAt:string|null;hkex:string|null;stages:Set<Stage>;issuers:string[];apply:boolean}
function bad():never{console.error(USAGE);process.exit(2);}
function parseArgs(argv:string[]):Args{
 const a:Args={gleif:null,gleifDownloadedAt:null,hkex:null,stages:new Set(STAGES.all),issuers:[],apply:false};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(k==='--apply')a.apply=true;
  else if(k==='--gleif')a.gleif=argv[++i]??bad();
  else if(k==='--gleif-downloaded-at'){const v=argv[++i]??bad();if(!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2}))?$/.test(v)||Number.isNaN(Date.parse(v)))bad();a.gleifDownloadedAt=v;}
  else if(k==='--hkex')a.hkex=argv[++i]??bad();
  else if(k==='--stage'){const s=STAGES[argv[++i]??''];if(!s)bad();a.stages=new Set(s);}
  else if(k==='--issuer'){const id=argv[++i]??bad();if(!UUID.test(id))bad();a.issuers.push(id.toLowerCase());}
  else bad();
 }
 if(a.gleifDownloadedAt&&!a.stages.has('A'))bad();
 if(a.stages.has('A')&&(!a.gleif||!existsSync(a.gleif)))bad();
 if(a.stages.has('D')&&(!a.hkex||!existsSync(a.hkex)))bad();
 return a;
}

async function fileDigest(path:string):Promise<{sha256:string;bytes:number}>{
 const h=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(path)){const b=chunk as Buffer;h.update(b);bytes+=b.length;}
 return {sha256:h.digest('hex'),bytes};
}

interface Inputs{
 issuers:IssuerRow[];openRows:SecRow[];universe:Set<string>;scope:Row[];issuerRows:Row[];
 gleif:{subset:GleifSubset;sha256:string;bytes:number;downloaded_at:string|null;file_mtime:string}|null;
 hkex:{parses:HkexListParse[];bytes:Map<HkexFileId,Uint8Array>}|null;
}

/** Everything that needs no network and no bucket: DB reads, the GLEIF subset, the HKEX parses. */
async function readInputs(tables:TableClient,args:Args):Promise<Inputs>{
 const issuerRows=await selectAll(tables,'issuers',{},'issuer_id');
 const issuers=issuerRows.filter(r=>r.status==='active'&&(args.issuers.length===0||args.issuers.includes(String(r.issuer_id))))
  .map(r=>({issuer_id:String(r.issuer_id),lei:str(r.lei),usci:str(r.usci)}));
 const openRows=(await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'))
  .map(r=>({issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from),isin:str(r.isin),figi:str(r.figi),provenance:obj(r.provenance)}));
 const universe=new Set((await selectAll(tables,'stocks_universe',{},'ticker')).map(r=>String(r.ticker)));
 const scope=await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id');
 let gleif:Inputs['gleif']=null;
 if(args.stages.has('A')){
  const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
  const lines:string[]=[];
  for await(const l of filterGleifLines(createInterface({input:createReadStream(args.gleif!),crlfDelay:Infinity}),leis))lines.push(l);
  const digest=await fileDigest(args.gleif!);
  gleif={subset:subsetForLeis(lines,leis),...digest,downloaded_at:args.gleifDownloadedAt,file_mtime:statSync(args.gleif!).mtime.toISOString()};
 }
 let hkex:Inputs['hkex']=null;
 if(args.stages.has('D')){
  const parses:HkexListParse[]=[];const bytes=new Map<HkexFileId,Uint8Array>();
  for(const f of HKEX_LIST_FILES){
   const p=join(args.hkex!,f.file);
   if(!existsSync(p))continue;
   const b=new Uint8Array(readFileSync(p));
   parses.push(parseHkexList(b,f.id));bytes.set(f.id,b);
  }
  hkex={parses,bytes};
 }
 return {issuers,openRows,universe,scope,issuerRows,gleif,hkex};
}

/** Stores the evidence, calls OpenFIGI (B, then C for rows still without a FIGI) and plans. */
async function evidenceAndPlan(inp:Inputs,raw:RawStore,args:Args,asOf:string):Promise<{plan:IdentifierPlan;exhausted:boolean;requests:number}>{
 if(inp.gleif)await raw.put({kind:'gleif',bytes:new TextEncoder().encode(inp.gleif.subset.csv),contentType:'text/csv',
  meta:{source_sha256:inp.gleif.sha256,source_bytes:inp.gleif.bytes,file_mtime:inp.gleif.file_mtime,...(inp.gleif.downloaded_at?{downloaded_at:inp.gleif.downloaded_at}:{}),leis:inp.gleif.subset.byLei.size}});
 let hkexMap:ReadonlyMap<string,HkexIsin>|null=null;
 if(inp.hkex){
  // each workbook keeps its own content type (two are .xls)
  for(const p of inp.hkex.parses){
   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
   await raw.put({kind:'hkex',bytes:inp.hkex.bytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
  }
  const merged=mergeHkexIsins(inp.hkex.parses);
  hkexMap=merged.hasIsinColumn?merged.byCode:null;
 }
 const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null,budget:makeBudget(null)};
 let isinResults:ReadonlyMap<string,FigiJobResult>=new Map();
 let exhausted=false,requests=0;
 if(args.stages.has('B')&&inp.gleif){
  const m=await mapIsins([...new Set([...inp.gleif.subset.byLei.values()].flat())].sort(),deps);
  isinResults=m.byKey;exhausted=m.exhausted;requests+=m.requests;
 }
 const base:PlanInput={asOf,stages:args.stages,issuers:inp.issuers,openRows:inp.openRows,universe:inp.universe,
  gleif:inp.gleif?{sha256:inp.gleif.subset.sha256,byLei:inp.gleif.subset.byLei}:null,isinResults,tickerResults:new Map(),hkex:hkexMap};
 let plan=planIdentifierWrites(base);
 if(args.stages.has('C')&&!exhausted&&plan.figiMissing.length){
  const m=await mapTickers(plan.figiMissing,deps);
  exhausted=m.exhausted;requests+=m.requests;
  plan=planIdentifierWrites({...base,tickerResults:m.byKey});
 }
 return {plan,exhausted,requests};
}

function summary(plan:IdentifierPlan){
 const by=(xs:string[])=>xs.reduce<Record<string,number>>((m,x)=>{m[x]=(m[x]??0)+1;return m;},{});
 return {
  writes:by(plan.writes.map(w=>`${w.kind}:${w.column}`)),claims:by(plan.claims.map(c=>`${c.op}:${c.id_type}`)),quarantines:plan.quarantines.length,
  recons:{passed:plan.recons.filter(r=>r.passed).length,failed:plan.recons.filter(r=>!r.passed).length},
  ahCandidates:plan.ahCandidates.length,duplicates:plan.duplicates,figiMissing:plan.figiMissing.length,skipped:by(plan.skipped),
 };
}
function projectedRows(inp:Inputs,plan:IdentifierPlan):Row[]{
 const k=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
 const sets=new Map(plan.writes.filter(w=>w.kind==='set').map(w=>[`${k(w)}|${w.column}`,w.value]));
 return inp.openRows.map(r=>({...r,valid_to:null,isin:r.isin??sets.get(`${k(r)}|isin`)??null,figi:r.figi??sets.get(`${k(r)}|figi`)??null}));
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(args.apply&&!EXCH_MAP_VERIFIED){
  console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (docs/audits/2026-11-05-data-foundation-3/verification.md)');
  process.exit(2);
 }
 const admin=getAdminSupabase();
 const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 let inp:Inputs;
 try{inp=await readInputs(tables,args);}
 catch(e){
  // A malformed GLEIF/HKEX file still leaves a failed receipt in --apply mode (spec §8 invalid_schema).
  const code=errorMessage(e)==='invalid_schema'?'invalid_schema':'exception';
  if(args.apply){
   const {batchId}=await startBatch(tables,{producer:'fill-identifiers',dataset:DATASET,toolVersions:{openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION}});
   await finishBatch(tables,batchId,{counts:emptyCounts(),errors:[{code,message:errorMessage(e)}]});
   await recordAttempt(tables,DATASET,{ok:false,cadence:cadenceOf(DATASET)});
  }
  console.error(`${code}: ${errorMessage(e)}`);process.exit(1);
 }
 if(!args.apply){
  const {plan,exhausted,requests}=await evidenceAndPlan(inp,memoryRawStore(),args,asOf);
  console.log(JSON.stringify({
   mode:'dry-run (no batch, nothing written; pass --apply)',stages:[...args.stages].sort().join(''),issuers:inp.issuers.length,openfigiRequests:requests,quotaExhausted:exhausted,
   plan:summary(plan),
   e1:{current:coverageE1({scope:inp.scope,securities:inp.openRows.map(r=>({...r,valid_to:null})),issuers:inp.issuerRows}),projected:coverageE1({scope:inp.scope,securities:projectedRows(inp,plan),issuers:inp.issuerRows})},
  },null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'fill-identifiers',dataset:DATASET,toolVersions:{
  gleif_file_sha256:inp.gleif?.sha256??'none',gleif_subset_sha256:inp.gleif?.subset.sha256??'none',
  hkex_file_sha256s:JSON.stringify(Object.fromEntries((inp.hkex?.parses??[]).map(p=>[p.file,p.sha256]))),
  openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,stages:[...args.stages].sort().join(''),as_of:asOf,
 }});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {plan,exhausted}=await evidenceAndPlan(inp,supabaseRawStore(admin),args,asOf);
  ({counts,errors}=await applyIdentifierPlan(tables,plan,{batchId,dataset:DATASET}));
  if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs of this run skipped'}];
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
