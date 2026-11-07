// src/app/api/cron/judgments-calibrate/route.ts
// Weekly calibration (spec §8.3; vercel.json "0 4 * * 1"): CRON_SECRET bearer (same timing-safe check
// as facts-sync and judgments-settle), maxDuration 300 with a 280 s deadline handed to the core, which
// stops starting pages when less than 30 s remain and resumes next run. ?preview=1 reads unit states
// only (no batch, no writes). A missing code version refuses the run. The HTTP receipt carries codes,
// keys and counts only — never error messages.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {previewCalibrate,runCalibrate} from '@/lib/judgments/calibrate';
import type {CalibrateReceipt} from '@/lib/judgments/calibrate';
import {productionCalibrateDeps} from '@/lib/judgments/calibrate-deps';
import {resolveCodeVersion} from '@/lib/judgments/deps';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=280_000;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
const publicReceipt=(r:CalibrateReceipt)=>({batchId:r.batchId,status:r.status,counts:r.counts,
 errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),
 units:r.units.map(u=>({job:u.job,outcome:u.outcome,pages:u.pages,...(u.calibration_id?{calibration_id:u.calibration_id}:{}),...(u.code?{code:u.code}:{})}))});

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const url=new URL(request.url);
 const preview=url.searchParams.getAll('preview');
 if(preview.length>1||(preview.length===1&&preview[0]!=='1'))return err('invalid_parameter:preview','preview must be 1',400);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=productionCalibrateDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion,triggeredBy:'cron'});
  if(preview.length===1)return NextResponse.json({ok:true,preview:true,started_at:started.toISOString(),units:await previewCalibrate(deps)},{headers:{'Cache-Control':'no-store'}});
  const receipt=await runCalibrate(deps);
  return NextResponse.json({ok:receipt.status==='success',started_at:started.toISOString(),receipt:publicReceipt(receipt)},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return err('calibrate_failed','Judgments calibration failed',500);
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
