// scripts/dq/record-ixbrl-fixture.ts
/**
 * Records a reproducible trimmed inline XBRL fixture from a real SEC primary document (plan 3 Task 13c).
 *
 *   npx tsx scripts/dq/record-ixbrl-fixture.ts --cik 320193 --accn 0000320193-23-000106 --out src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm --raw-dir <dir>
 *
 * 1. GET https://data.sec.gov/submissions/CIK##########.json and find the accession in filings.recent
 *    (primaryDocument, isInlineXBRL, form, filingDate, reportDate) plus the top-level category and
 *    fiscalYearEnd. An accession only reachable through filings.files[] pages is refused (exit 1).
 * 2. GET https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<primaryDocument>.
 * 3. Both downloaded originals (kinds sec-submissions / sec-document) are retained through a RawStore BEFORE the
 *    trim and before any fixture output; the run fails if retention fails. --raw-dir <dir> writes
 *    content-addressed files named exactly like RawStore paths (<kind>/<sha>.<ext> plus .meta.json, never
 *    overwritten); without it the Supabase store is used when NEXT_PUBLIC_SUPABASE_URL and
 *    SUPABASE_SERVICE_ROLE_KEY are set, otherwise the run refuses.
 * 4. trimInlineXbrl(document, {keep: factConceptKeep, dropDimensional: true}); write <out> and
 *    <out>.meta.json {source_url, source_sha256, source_bytes, fetched_at, trim_version, parser_version,
 *    trimmed_sha256, facts, contexts, units, raw:{document,submissions}:{path,sha256,status},
 *    submissions:{url, sha256, accession, form, filingDate, reportDate, primaryDocument, isInlineXBRL,
 *    category, fiscalYearEnd}}.
 * User-Agent = EDGAR_USER_AGENT or DEFAULT_USER_AGENT; paced by the process-wide secPacer. The fixture files are
 * written only after both downloads, their retention and the trim succeeded. Exit 1 on failure, 2 on bad arguments.
 */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import type {RawStore} from '../../src/lib/dq/raw-store';
import {budgetFor,secPacer} from '../../src/lib/facts/providers/shared';
import {IXBRL_PARSER_VERSION,MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from '../../src/lib/dq/reconcile/ixbrl-trim';

const USAGE='usage: record-ixbrl-fixture.ts --cik <digits> --accn <##########-##-######> --out <path.htm> [--raw-dir <dir>]';
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');

async function get(url:string):Promise<Uint8Array>{
 await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});   // the one process-wide SEC pacer
 const res=await fetch(url,{headers:{'User-Agent':process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'*/*'},signal:AbortSignal.timeout(60_000)});
 if(!res.ok)throw new Error(`http_${res.status} ${url}`);
 const declared=Number(res.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_IXBRL_BYTES){await res.body?.cancel();throw new Error(`too_large ${url}`);}
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
 return bytes;
}

/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
function dirRawStore(dir:string):RawStore{
 const mem=memoryRawStore();
 return {
  sha256Of:mem.sha256Of,
  async put(item,budget){
   const r=await mem.put(item,budget);
   for(const [p,bytes] of mem.objects){
    const full=join(dir,p);
    if(existsSync(full))continue;
    mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,bytes,{flag:'wx'});
   }
   return r;
  },
 };
}
async function rawStoreFor(rawDir:string):Promise<RawStore>{
 if(rawDir)return dirRawStore(rawDir);
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {getAdminSupabase}=await import('../../src/lib/supabase/admin');
  return supabaseRawStore(getAdminSupabase());
 }
 throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

async function main(){
 const argv=process.argv.slice(2);let cik='',accn='',out='',rawDir='';
 for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(v===''){console.error(USAGE);process.exit(2);}if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else if(k==='--raw-dir')rawDir=v;else{console.error(USAGE);process.exit(2);}}
 if(!/^[1-9]\d{0,9}$/.test(cik)||!/^\d{10}-\d{2}-\d{6}$/.test(accn)||!out.endsWith('.htm')){console.error(USAGE);process.exit(2);}
 const subUrl=`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`;
 const subBytes=await get(subUrl);
 const sub=JSON.parse(new TextDecoder().decode(subBytes)) as {category?:string;fiscalYearEnd?:string;filings?:{recent?:Record<string,unknown[]>}};
 const recent=sub.filings?.recent??{};
 const idx=(recent.accessionNumber??[]).indexOf(accn);
 if(idx<0)throw new Error(`accession ${accn} not in filings.recent (filings.files pages are not supported by this recorder)`);
 const at=(k:string)=>(recent[k]??[])[idx];
 const primaryDocument=String(at('primaryDocument')??'');
 if(!primaryDocument)throw new Error('no primaryDocument');
 const sourceUrl=`https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g,'')}/${primaryDocument}`;
 const source=await get(sourceUrl);
 const store=await rawStoreFor(rawDir);
 const rawSub=await store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:subUrl,accession:accn}});
 const rawDoc=await store.put({kind:'sec-document',bytes:source,contentType:'text/html',meta:{source_url:sourceUrl,accession:accn}});
 const trimmed=trimInlineXbrl(new TextDecoder('utf-8').decode(source),{keep:factConceptKeep,dropDimensional:true});
 const meta={source_url:sourceUrl,source_sha256:sha(source),source_bytes:source.byteLength,fetched_at:new Date().toISOString(),trim_version:IXBRL_TRIM_VERSION,parser_version:IXBRL_PARSER_VERSION,
  trimmed_sha256:sha(trimmed.html),facts:trimmed.facts,contexts:trimmed.contexts,units:trimmed.units,
  raw:{document:{path:rawDoc.path,sha256:rawDoc.sha256,status:rawDoc.status},submissions:{path:rawSub.path,sha256:rawSub.sha256,status:rawSub.status}},
  submissions:{url:subUrl,sha256:sha(subBytes),accession:accn,form:at('form')??null,filingDate:at('filingDate')??null,reportDate:at('reportDate')??null,primaryDocument,isInlineXBRL:at('isInlineXBRL')===1||at('isInlineXBRL')===true,category:sub.category??null,fiscalYearEnd:sub.fiscalYearEnd??null}};
 writeFileSync(out,trimmed.html);
 writeFileSync(`${out}.meta.json`,`${JSON.stringify(meta,null,1)}\n`);
 console.log(JSON.stringify({out,source_sha256:meta.source_sha256,trimmed_sha256:meta.trimmed_sha256,facts:trimmed.facts}));
}

main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
