/**
 * Mirror the methodology registry into judgment_methodologies (spec §4.1, §5.1 / §5.1b).
 *
 *   node --env-file=.env.local --import tsx scripts/judgments/sync-methodologies.ts [--dry-run] [--only <id>@<version>]...
 *        [--publishable <id>@<version>]... [--owner-confirmation "<who, when, which licences were confirmed>"] [--unpublish <id>@<version>]...
 *
 * Plans every REGISTRY method (src/lib/judgments/methodology-sync.ts) and prints one JSON line per
 * method {key, action, problems, formula_hash, stored_formula_hash, closure_files} then a summary.
 * Any drift (formula_hash or an immutable column changed without a new version) or invalid item →
 * nothing is written, exit 2. --dry-run reads the database and prints the plan without writing.
 * publishable becomes true only with --publishable plus --owner-confirmation (≥ 10 characters; it is
 * stored as the methodology event reason) AND every origin key reachable from the method's input_kinds
 * marked "confirmed" in docs/methodologies/licenses.json (commander decision D3: this script is the
 * file's only reader; no method imports it). publishable never changes formula_hash.
 * Exit 0 ok, 1 runtime error, 2 drift / invalid / bad arguments.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {supabaseJudgmentsDb} from '../../src/lib/judgments/db';
import {LICENSES_PATH,applyMethodologySync,planExitCode,planMethodologySync,validateLicenseTable} from '../../src/lib/judgments/methodology-sync';
import {REGISTRY} from '../../src/lib/judgments/registry';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

const USAGE='usage: sync-methodologies.ts [--dry-run] [--only id@vN]... [--publishable id@vN]... [--owner-confirmation "<text>"] [--unpublish id@vN]...';
const KEY=/^[a-z][a-z0-9_]{1,63}@v[1-9][0-9]{0,3}$/;
async function main(){
 const argv=process.argv.slice(2);let dryRun=false;let confirmation:string|undefined;
 const only=new Set<string>(),publish=new Set<string>(),unpublish=new Set<string>();
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--dry-run')dryRun=true;
  else if((x==='--only'||x==='--publishable'||x==='--unpublish')&&v&&KEY.test(v)){(x==='--only'?only:x==='--publishable'?publish:unpublish).add(v);i++;}
  else if(x==='--owner-confirmation'&&v){confirmation=v;i++;}
  else{console.error(USAGE);process.exit(2);}
 }
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(!codeVersion){console.error('code_version_missing: set VERCEL_GIT_COMMIT_SHA or run inside the git checkout');process.exit(1);}
 const licenses=validateLicenseTable(JSON.parse(readFileSync(join(process.cwd(),LICENSES_PATH),'utf8')));
 const db=supabaseJudgmentsDb({anon:getAnonSupabase(),admin:getAdminSupabase()});
 const plan=await planMethodologySync(REGISTRY,db,{repoRoot:process.cwd(),codeVersion,only:only.size?only:undefined,publish,unpublish,ownerConfirmation:confirmation,licenses});
 for(const p of plan)console.log(JSON.stringify({key:p.key,action:p.action,problems:p.problems,formula_hash:p.row?.formula_hash??null,stored_formula_hash:p.existing?.formula_hash??null,publishable:p.row?.publishable??null,closure_files:p.closure.length}));
 const exit=planExitCode(plan);
 if(exit!==0){console.log(JSON.stringify({synced:0,refused:true,reason:'drift_or_invalid'}));process.exit(2);}
 if(dryRun){console.log(JSON.stringify({synced:0,dry_run:true,planned:plan.length}));return;}
 const done=await applyMethodologySync(plan,db);
 console.log(JSON.stringify({synced:done.length,changed:done.filter(d=>d.changed).length}));
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
