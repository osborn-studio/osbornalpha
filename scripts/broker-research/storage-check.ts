// scripts/broker-research/storage-check.ts
// Storage HTTP gate (spec §12.3), run by a human against the LOCAL Supabase stack before FR-6:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… npm run test:storage
// Checks: bucket private + 50 MiB + MIME list; anon AND authenticated reads of reports/* and staging/*
// denied; signed upload URL works once with the same raw PUT the admin upload page uses and is refused
// the second time; move semantics (source gone, no overwrite); signed read URL expiry; MIME and size
// rejection; objects and earlier signed URLs dead after removal. Writes a receipt JSON into
// docs/audits/2026-11-06-foreign-research/ and exits 1 on any failure. Refuses any non-local host.
// Creates and deletes one throwaway auth user (random example.test address) for the authenticated check.
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resolveCodeVersion} from '../../src/lib/facts/deps';

const BUCKET='broker-research',MAX=52428800;
interface Check{name:string;passed:boolean;detail:string}
const checks:Check[]=[];
const check=(name:string,passed:boolean,detail='')=>{checks.push({name,passed,detail});console.log(`${passed?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const pdf=(extra='')=>new Blob([`%PDF-1.7\n% storage-check ${extra}\n%%EOF\n`],{type:'application/pdf'});

async function denied(c:SupabaseClient,path:string){const {data,error}=await c.storage.from(BUCKET).download(path);return data===null&&error!==null;}
async function exists(c:SupabaseClient,path:string){const {data}=await c.storage.from(BUCKET).download(path);return data!==null;}
async function putRaw(url:string,body:Blob){const r=await fetch(url,{method:'PUT',headers:{'content-type':'application/pdf','x-upsert':'false'},body});return r.status;}

async function main(){
 const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,anonKey=process.env.SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!service||!anonKey)throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are required');
 const host=new URL(url).hostname;
 if(!['localhost','127.0.0.1','[::1]'].includes(host))throw new Error(`refusing non-local Supabase host ${host}: run against the local stack only`);
 const opts={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,service,opts),anon=createClient(url,anonKey,opts);
 const tag=randomUUID(),rep=`reports/storage-check-${tag}.pdf`,stg=`staging/storage-check-${tag}.pdf`,moved=`reports/storage-check-${tag}-moved.pdf`;
 const cleanup:string[]=[rep,stg,moved];let userId:string|null=null;
 try{
  const {data:bucket}=await admin.storage.getBucket(BUCKET);
  check('bucket is private with the 50 MiB limit and the MIME list',bucket?.public===false&&bucket.file_size_limit===MAX&&['application/pdf','application/json','image/png'].every(m=>bucket.allowed_mime_types?.includes(m)),JSON.stringify({public:bucket?.public,limit:bucket?.file_size_limit,mime:bucket?.allowed_mime_types}));
  for(const p of [rep,stg]){const {error}=await admin.storage.from(BUCKET).upload(p,pdf(p),{contentType:'application/pdf'});check(`service_role uploads ${p.split('/')[0]}/*`,!error,error?.message??'');}
  check('anon cannot read reports/*',await denied(anon,rep));check('anon cannot read staging/*',await denied(anon,stg));
  const email=`storage-check-${tag}@example.test`,password=randomBytes(24).toString('base64url');
  const {data:created,error:ce}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  userId=created.user?.id??null;
  const authed=createClient(url,anonKey,opts);
  const {error:se}=await authed.auth.signInWithPassword({email,password});
  check('throwaway authenticated user signs in',!ce&&!se,ce?.message??se?.message??'');
  check('authenticated cannot read reports/*',await denied(authed,rep));check('authenticated cannot read staging/*',await denied(authed,stg));

  const up=`staging/storage-check-${tag}-signed.pdf`;cleanup.push(up);
  const {data:signed,error:sue}=await admin.storage.from(BUCKET).createSignedUploadUrl(up);
  const first=signed?await putRaw(signed.signedUrl,pdf('signed')):0;
  check('signed upload URL accepts one raw PUT',!sue&&first>=200&&first<300,`status ${first}`);
  const second=signed?await putRaw(signed.signedUrl,pdf('again')):0;
  check('signed upload URL refuses a second upload',second>=400,`status ${second}`);

  const {error:me}=await admin.storage.from(BUCKET).move(stg,moved);
  check('move staging → reports succeeds',!me,me?.message??'');
  check('move leaves no staging object',!(await exists(admin,stg)));check('move creates the target',await exists(admin,moved));
  const {error:overwrite}=await admin.storage.from(BUCKET).move(up,moved);
  check('move onto an existing object is refused',overwrite!==null,overwrite?.message??'no error');

  const {data:short}=await admin.storage.from(BUCKET).createSignedUrl(rep,2);
  const ok=short?(await fetch(short.signedUrl)).status:0;
  await sleep(3500);
  const late=short?(await fetch(short.signedUrl)).status:0;
  check('signed read URL works before expiry',ok===200,`status ${ok}`);check('signed read URL fails after expiry',late>=400,`status ${late}`);

  const txt=`reports/storage-check-${tag}.txt`;cleanup.push(txt);
  const {error:mimeErr}=await admin.storage.from(BUCKET).upload(txt,new Blob(['x'],{type:'text/plain'}),{contentType:'text/plain'});
  check('non-allowed MIME is rejected',mimeErr!==null,mimeErr?.message??'accepted');
  const big=`reports/storage-check-${tag}-big.pdf`;cleanup.push(big);
  const {error:sizeErr}=await admin.storage.from(BUCKET).upload(big,new Blob([new Uint8Array(MAX+1)],{type:'application/pdf'}),{contentType:'application/pdf'});
  check('object over 50 MiB is rejected',sizeErr!==null,sizeErr?.message??'accepted');

  const {data:longUrl}=await admin.storage.from(BUCKET).createSignedUrl(moved,600);
  await admin.storage.from(BUCKET).remove([moved]);
  check('purged object is gone',!(await exists(admin,moved)));
  const after=longUrl?(await fetch(longUrl.signedUrl)).status:0;
  check('a signed URL minted before purge no longer serves the object',after>=400,`status ${after}`);
 }finally{
  await admin.storage.from(BUCKET).remove(cleanup).catch(()=>undefined);
  if(userId)await admin.auth.admin.deleteUser(userId).catch(()=>undefined);
 }
 const passed=checks.length>0&&checks.every(c=>c.passed);
 const dir=join(process.cwd(),'docs/audits/2026-11-06-foreign-research');mkdirSync(dir,{recursive:true});
 const at=new Date().toISOString();
 const file=join(dir,`storage-check-${at.replace(/[:.]/g,'-')}.json`);
 writeFileSync(file,JSON.stringify({kind:'broker-research storage-check',ran_at:at,supabase_host:host,code_version:resolveCodeVersion({allowGit:true})??'unknown',passed,checks},null,2)+'\n');
 console.log(`${passed?'ALL PASS':'FAILURES'} — receipt ${file}`);
 process.exit(passed?0:1);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
