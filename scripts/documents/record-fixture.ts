/**
 * Record an HKEXnews PDF as a pages.json fixture (spec §11.3). Network; never run in CI.
 *
 *   npx tsx scripts/documents/record-fixture.ts --hkex <https://www1.hkexnews.hk/listedco/…/<file id>.pdf> [--pages 44-47,51-52] [--out <dir>]
 *
 * --pages keeps only those pages in pages_json (pages_subset: true; page_count and content_sha256 stay
 * those of the whole PDF): the committed 0268.HK fixture stores only its primary-statement pages.
 * The summary line reports cjk_chars over ALL pages — a smoke signal for the pdf.js CMaps (a Chinese
 * report with 0 CJK characters means cMapUrl did not resolve; exit 1).
 * Downloads the PDF (User-Agent = EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT, ≤ 52,428,800 bytes),
 * runs extractPdf with no deadline, builds pages.json exactly as runDocumentsExtract does
 * (code_version = git HEAD, '-dirty' when the tree has changes, else 'unknown') and writes
 * src/lib/documents/fixtures/hkex/<source_ref>.pages.json =
 *   {recorded_at, source_url, source_ref, content_sha256, bytes, page_count, extractor_version, table_algo_version, pages_json}
 * The PDF itself is NOT written anywhere in the repo (licence and size); validate-extraction.ts later
 * re-downloads it and compares content_sha256 and per-page text_hash. source_ref is the file id of the
 * URL (…/2026090300863_c.pdf → 2026090300863_c), the same rule as the hkexnews source adapter.
 * Exit 2 on bad arguments, 1 on download/extraction failure.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
import {extractPdf} from '../../src/lib/documents/extract/pdf';
import {buildPagesJson,sha256Hex} from '../../src/lib/documents/extract/pages-json';
import type {RecordedPagesFixture} from '../../src/lib/documents/extract/pages-json';
import {EXTRACTOR_VERSION,MAX_DOC_BYTES,TABLE_ALGO_VERSION} from '../../src/lib/documents/types';

const USAGE='usage: record-fixture.ts --hkex <hkexnews pdf url> [--pages a-b,c] [--out <dir>]';
/** '44-47,51' → {44,45,46,47,51}; null on any malformed part. */
function parsePages(spec:string):Set<number>|null{
 const out=new Set<number>();
 for(const part of spec.split(',')){
  const m=/^(\d+)(?:-(\d+))?$/.exec(part.trim());if(!m)return null;
  const a=Number(m[1]),b=Number(m[2]??m[1]);if(a<1||b<a||b-a>2000)return null;
  for(let n=a;n<=b;n++)out.add(n);
 }
 return out.size>0?out:null;
}
const DEFAULT_OUT=fileURLToPath(new URL('../../src/lib/documents/fixtures/hkex/',import.meta.url));
const fail=(msg:string,code=2):never=>{console.error(msg);process.exit(code);};

function hkexSourceRef(url:string):string|null{
 let u:URL;try{u=new URL(url);}catch{return null;}
 if(u.protocol!=='https:'||u.hostname!=='www1.hkexnews.hk')return null;
 const m=/^\/listedco\/listconews\/[a-z]+\/\d{4}\/\d{4}\/([A-Za-z0-9_]+)\.pdf$/i.exec(u.pathname);
 return m?m[1]:null;
}

async function download(url:string):Promise<Uint8Array>{
 const res=await fetch(url,{headers:{'User-Agent':process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'application/pdf'},signal:AbortSignal.timeout(120_000)});
 if(!res.ok||!res.body)fail(`download failed: HTTP ${res.status}`,1);
 const declared=Number(res.headers.get('content-length')??'0');
 if(declared>MAX_DOC_BYTES)fail(`document_too_large: ${declared} bytes`,1);
 const chunks:Uint8Array[]=[];let n=0;
 for await(const c of res.body as unknown as AsyncIterable<Uint8Array>){n+=c.length;if(n>MAX_DOC_BYTES)fail('document_too_large while streaming',1);chunks.push(c);}
 const out=new Uint8Array(n);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}
 return out;
}

async function main(){
 const argv=process.argv.slice(2);let url:string|undefined;let outDir=DEFAULT_OUT;let only:Set<number>|null=null;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--hkex'&&argv[i+1])url=argv[++i];
  else if(argv[i]==='--out'&&argv[i+1])outDir=argv[++i];
  else if(argv[i]==='--pages'&&argv[i+1])only=parsePages(argv[++i])??fail(USAGE);
  else fail(USAGE);
 }
 if(!url)fail(USAGE);
 const sourceRef=hkexSourceRef(url!)??fail(`not an HKEXnews listedco PDF url: ${url}`);
 const bytes=await download(url!);
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')fail('downloaded bytes are not a PDF',1);
 const contentSha=sha256Hex(bytes);
 const {pages,hasTextLayer}=await extractPdf(bytes,{remainingMs:()=>Number.POSITIVE_INFINITY});
 const cjkChars=pages.reduce((k,p)=>k+(p.text.match(/\p{Script=Han}/gu)?.length??0),0);
 if(only!==null&&[...only].some(n=>n>pages.length))fail(`--pages beyond the document's ${pages.length} pages`);
 const kept=only===null?pages:pages.filter(p=>only!.has(p.page_no));
 const built=buildPagesJson({content_sha256:contentSha,code_version:resolveCodeVersion({allowGit:true})??'unknown',has_text_layer:hasTextLayer,pages:kept});
 const fixture:RecordedPagesFixture={recorded_at:new Date().toISOString(),source_url:url!,source_ref:sourceRef,content_sha256:contentSha,bytes:bytes.length,page_count:pages.length,
  extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,...(only===null?{}:{pages_subset:true as const}),pages_json:built.json};
 mkdirSync(outDir,{recursive:true});
 const path=join(outDir,`${sourceRef}.pages.json`);
 writeFileSync(path,`${JSON.stringify(fixture,null,1)}\n`);
 console.log(JSON.stringify({wrote:path,source_ref:sourceRef,content_sha256:contentSha,bytes:bytes.length,page_count:pages.length,stored_pages:kept.map(p=>p.page_no),has_text_layer:hasTextLayer,cjk_chars:cjkChars,pages_json_sha256:built.sha256,tables:kept.reduce((k,p)=>k+p.tables.length,0)}));
 if(/_c$/i.test(sourceRef)&&cjkChars===0)fail('cjk_chars=0 on a Chinese HKEX document: pdf.js CMaps not found (pdfjsAssets)',1);
}

main().catch(e=>fail(e instanceof Error?e.message:String(e),1));
