/**
 * Judgments calibration from the command line (spec §8.3). Preview by default.
 *
 *   node --env-file=.env.local --import tsx scripts/judgments/calibrate.ts [--apply] [--json]
 *
 * Preview: unit states, page counts and validity revisions only (no batch, no writes). --apply runs
 * the job without a deadline (an ingest_batches receipt, dataset judgments.calibrate, triggered_by
 * script; units resume from judgment_job_state exactly like the cron) and needs a code version
 * (VERCEL_GIT_COMMIT_SHA or a git checkout). tsx does NOT load .env.local: use node --env-file.
 * Exit 0 on success or partial, 1 when the batch failed, 2 on bad arguments or no code version.
 */
import {previewCalibrate,runCalibrate} from '../../src/lib/judgments/calibrate';
import {productionCalibrateDeps} from '../../src/lib/judgments/calibrate-deps';
import {resolveCodeVersion} from '../../src/lib/judgments/deps';

const USAGE='usage: calibrate.ts [--apply] [--json]';

async function main(argv:string[]):Promise<number>{
 let apply=false,json=false;
 for(const a of argv){if(a==='--apply')apply=true;else if(a==='--json')json=true;else{console.error(USAGE);return 2;}}
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(!codeVersion){console.error('no code version: set VERCEL_GIT_COMMIT_SHA or run from a git checkout');return 2;}
 const deps=productionCalibrateDeps({deadline:null,codeVersion,triggeredBy:'script'});
 if(!apply){
  const units=await previewCalibrate(deps);
  if(json)console.log(JSON.stringify({preview:true,units},null,1));
  else for(const u of units)console.log(`${u.job}  ${u.state}${u.generation?`  gen=${u.generation} pages=${u.pages}`:''}  revision ${u.expected_revision??'-'}/${u.current_revision}${u.stale?'  (stale)':''}`);
  return 0;
 }
 const r=await runCalibrate(deps);
 if(json)console.log(JSON.stringify(r,null,1));
 else{
  console.log(`batch ${r.batchId} ${r.status} ${JSON.stringify(r.counts)}`);
  for(const u of r.units)console.log(`${u.job}  ${u.outcome}  pages=${u.pages}${u.calibration_id?`  ${u.calibration_id}`:''}${u.code?`  ${u.code}`:''}`);
  for(const e of r.errors)console.log(`  ${e.code}${e.key?` ${e.key}`:''}${e.message?`: ${e.message}`:''}`);
 }
 return r.status==='failed'||r.status==='rejected'?1:0;
}
main(process.argv.slice(2)).then(code=>process.exit(code),e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
