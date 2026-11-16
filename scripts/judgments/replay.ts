/**
 * Replay a registered judgment from its frozen inputs (spec §6.3).
 *
 *   node --env-file=.env.local --import tsx scripts/judgments/replay.ts --id <uuid> [--reconcile] [--json]
 *   node --import tsx scripts/judgments/replay.ts --fixture <path.json> [--json]        (offline; no database)
 *
 * --id reads the row with the service-role client (unpublished methods included) and, with --reconcile,
 * rebuilds each input through the anon JudgmentInputsDb. --fixture replays a golden fixture file
 * (fixtures/judgments/replay/*.json) against REGISTRY plus the test-only replay methods; --reconcile is
 * reported as unavailable offline. Never writes. Exit 0 exact / inputs_only, 2 input_hash_mismatch or
 * diverged, 1 bad arguments or runtime error.
 */
import {readFileSync} from 'node:fs';
import {supabaseJudgmentsDb} from '../../src/lib/judgments/db';
import {anonJudgmentInputsDb} from '../../src/lib/judgments/inputs-db';
import {REGISTRY} from '../../src/lib/judgments/registry';
import {fixtureJudgmentsDb,parseReplayFixture,replayExitCode,replayJudgment} from '../../src/lib/judgments/replay';
import type {ReplayDeps,ReplayReport} from '../../src/lib/judgments/replay';
import {syntheticFactMetric} from '../../src/lib/judgments/testing/synthetic-method';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

const USAGE='usage: replay.ts (--id <uuid> | --fixture <path.json>) [--reconcile] [--json]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function print(r:ReplayReport,json:boolean){
 if(json){console.log(JSON.stringify(r));return;}
 console.log(`${r.judgment_id} ${r.methodology.id}@${r.methodology.version} (${r.producer_kind}): ${r.status}`);
 for(const m of r.hash_mismatches)console.log(`  input_hash_mismatch ${m.label} [index ${m.index}] stored ${m.stored.slice(0,12)} computed ${m.computed.slice(0,12)}`);
 for(const d of r.diffs)console.log(`  diverged ${d.field}: registered ${JSON.stringify(d.registered)} replayed ${JSON.stringify(d.replayed)}`);
 for(const c of r.reconcile??[])console.log(`  reconcile ${c.label}: ${c.status}${c.detail?` (${c.detail})`:''}`);
}
async function main(){
 const argv=process.argv.slice(2);let id:string|undefined,fixture:string|undefined,reconcile=false,json=false;
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--id'&&v&&UUID.test(v)){id=v;i++;}
  else if(x==='--fixture'&&v){fixture=v;i++;}
  else if(x==='--reconcile')reconcile=true;
  else if(x==='--json')json=true;
  else{console.error(USAGE);process.exit(1);}
 }
 if((id===undefined)===(fixture===undefined)){console.error(USAGE);process.exit(1);}
 let report:ReplayReport;
 if(fixture!==undefined){
  const fx=parseReplayFixture(JSON.parse(readFileSync(fixture,'utf8')));
  const deps:ReplayDeps={db:fixtureJudgmentsDb([fx.judgment]),registry:[...REGISTRY,syntheticFactMetric],reconcile};
  report=await replayJudgment(fx.judgment.judgment_id,deps);
  if(report.status!==fx.expect&&report.status!=='input_hash_mismatch'&&report.status!=='diverged'){print(report,json);console.error(`fixture expects ${fx.expect}`);process.exit(2);}
 }else{
  const anon=getAnonSupabase();
  report=await replayJudgment(id!,{db:supabaseJudgmentsDb({anon,admin:getAdminSupabase()}),registry:REGISTRY,inputsDb:anonJudgmentInputsDb({anon}),reconcile});
 }
 print(report,json);
 process.exit(replayExitCode(report));
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
