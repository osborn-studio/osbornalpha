// scripts/dq/gold-pdf.ts
/**
 * Verifies and uploads the annual-report PDFs referenced by an A-share gold file (spec §3.1 bucket reconcile-raw, §5.4).
 *
 *   node --env-file=.env.local --import tsx scripts/dq/gold-pdf.ts --gold <gold.json> --pdf-dir <dir> [--upload]
 *
 * For every distinct rows[].source.pdf_sha256 of the gold file (read leniently, so PDFs can be uploaded while the
 * transcription is still in progress; '<pending>' hashes are skipped and counted): finds the local *.pdf in --pdf-dir
 * whose bytes hash to it. Without --upload it only reports {sha256, file, announcement_ids}. With --upload each
 * matched PDF goes to reconcile-raw as kind 'cn-gold-pdf' (content-addressed; an existing object is 'exists') and the
 * stored sha256 must equal the gold file's value. A PDF that is missing locally, or a stored hash that differs, makes
 * the exit code 1; nothing is ever renamed or rewritten. Exit 2 on bad arguments.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {supabaseRawStore} from '../../src/lib/dq/raw-store';
import {budgetFor} from '../../src/lib/facts/providers/shared';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: gold-pdf.ts --gold <gold.json> --pdf-dir <dir> [--upload]';
const SHA=/^[0-9a-f]{64}$/;

async function main(){
 const argv=process.argv.slice(2);let gold='',dir='',upload=false;
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--gold'&&v){gold=v;i++;}else if(x==='--pdf-dir'&&v){dir=v;i++;}else if(x==='--upload')upload=true;else{console.error(USAGE);process.exit(2);}
 }
 if(!gold||!dir){console.error(USAGE);process.exit(2);}
 const json=JSON.parse(readFileSync(gold,'utf8')) as {rows?:{source?:{pdf_sha256?:unknown;cninfo_announcement_id?:unknown}}[]};
 const wanted=new Map<string,Set<string>>();let pending=0;
 for(const r of json.rows??[]){
  const sha=r.source?.pdf_sha256;
  if(typeof sha!=='string'||!SHA.test(sha)){pending++;continue;}
  const ids=wanted.get(sha)??new Set<string>();if(typeof r.source?.cninfo_announcement_id==='string')ids.add(r.source.cninfo_announcement_id);wanted.set(sha,ids);
 }
 const local=new Map<string,string>();
 for(const name of readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.pdf')).sort()){
  const p=join(dir,name);local.set(createHash('sha256').update(readFileSync(p)).digest('hex'),p);
 }
 const raw=upload?supabaseRawStore(getAdminSupabase()):null;
 let failed=0;
 for(const [sha,ids] of [...wanted.entries()].sort(([a],[b])=>a<b?-1:1)){
  const file=local.get(sha);
  if(!file){failed++;console.log(JSON.stringify({sha256:sha,status:'missing_locally',announcement_ids:[...ids]}));continue;}
  if(!raw){console.log(JSON.stringify({sha256:sha,status:'found',file,announcement_ids:[...ids]}));continue;}
  const stored=await raw.put({kind:'cn-gold-pdf',bytes:new Uint8Array(readFileSync(file)),contentType:'application/pdf',meta:{announcement_ids:[...ids].join(',')}},budgetFor(120_000));
  if(stored.sha256!==sha){failed++;console.log(JSON.stringify({sha256:sha,status:'hash_mismatch',stored:stored.sha256,file}));continue;}
  console.log(JSON.stringify({sha256:sha,status:stored.status,path:stored.path,file}));
 }
 console.log(JSON.stringify({gold,distinct_pdfs:wanted.size,pending_rows:pending,failed,uploaded:upload}));
 process.exit(failed>0?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
