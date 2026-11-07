/**
 * Regenerate the golden synthetic replay fixture (spec §14.4) offline from the plan-2 EDGAR fixture.
 *
 *   node --import tsx scripts/judgments/make-replay-fixture.ts [--check]
 *
 * Writes fixtures/judgments/replay/synthetic-fact-metric.json (generateSyntheticReplayFixture). --check
 * writes nothing and exits 2 when the committed file's normalised payload (id, inputs, claim,
 * condition, target, settle window …; not registered_at / created_at / batch_id / code_version)
 * differs from a fresh generation, 0 when it matches. Exit 1 on errors.
 */
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {samePayload} from '../../src/lib/judgments/register';
import {parseReplayFixture} from '../../src/lib/judgments/replay';
import {SYNTHETIC_FIXTURE_PATH,generateSyntheticReplayFixture} from '../../src/lib/judgments/testing/synthetic-fixture';

async function main(){
 const argv=process.argv.slice(2);
 if(argv.some(a=>a!=='--check')){console.error('usage: make-replay-fixture.ts [--check]');process.exit(1);}
 const fresh=await generateSyntheticReplayFixture();
 if(argv.includes('--check')){
  if(!existsSync(SYNTHETIC_FIXTURE_PATH)){console.error(`missing ${SYNTHETIC_FIXTURE_PATH}`);process.exit(2);}
  const committed=parseReplayFixture(JSON.parse(readFileSync(SYNTHETIC_FIXTURE_PATH,'utf8')));
  const ok=samePayload(committed.judgment,fresh.judgment);
  console.log(JSON.stringify({fixture:SYNTHETIC_FIXTURE_PATH,matches:ok,judgment_id:fresh.judgment.judgment_id}));
  process.exit(ok?0:2);
 }
 mkdirSync(dirname(SYNTHETIC_FIXTURE_PATH),{recursive:true});
 writeFileSync(SYNTHETIC_FIXTURE_PATH,`${JSON.stringify(fresh,null,1)}\n`);
 console.log(JSON.stringify({wrote:SYNTHETIC_FIXTURE_PATH,judgment_id:fresh.judgment.judgment_id,inputs:fresh.judgment.inputs.length}));
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
