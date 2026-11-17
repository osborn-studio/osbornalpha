/**
 * Mirror the methodology registry into judgment_methodologies (spec §4.1, §5.1 / §5.1b).
 *
 *   node --env-file=.env.local --import tsx scripts/judgments/sync-methodologies.ts [--dry-run] [--only <id>@<version>]...
 *        [--retire <id>@<version>]... [--reason "<text ≥ 10 chars>"]
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
import {JudgmentError} from '../../src/lib/judgments/errors';
import {REGISTRY} from '../../src/lib/judgments/registry';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

import {parseSyncArgs,planRetirements,applyRetirements} from '../../src/lib/judgments/methodology-retirement';

async function main(){
 const {dryRun,only,publish,unpublish,confirmation,retire,reason}=parseSyncArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(!codeVersion){console.error('code_version_missing: set VERCEL_GIT_COMMIT_SHA or run inside the git checkout');process.exit(1);}
 const licenses=validateLicenseTable(JSON.parse(readFileSync(join(process.cwd(),LICENSES_PATH),'utf8')));
 const db=supabaseJudgmentsDb({anon:getAnonSupabase(),admin:getAdminSupabase()});
 const retirements=await planRetirements(retire,reason,REGISTRY,db);
 for(const p of retirements)console.log(JSON.stringify({key:p.key,action:'retire',actor:'script',reason:p.reason,dry_run:dryRun}));
 const plan=await planMethodologySync(REGISTRY,db,{repoRoot:process.cwd(),codeVersion,only:only.size?only:undefined,publish,unpublish,ownerConfirmation:confirmation,licenses});
 for(const p of plan)console.log(JSON.stringify({key:p.key,action:p.action,problems:p.problems,formula_hash:p.row?.formula_hash??null,stored_formula_hash:p.existing?.formula_hash??null,publishable:p.row?.publishable??null,closure_files:p.closure.length}));
 const exit=planExitCode(plan);
 if(exit!==0){console.log(JSON.stringify({synced:0,refused:true,reason:'drift_or_invalid'}));process.exit(2);}
 if(dryRun){console.log(JSON.stringify({synced:0,dry_run:true,planned:plan.length}));return;}
 const done=await applyMethodologySync(plan,db);
 const retired=await applyRetirements(retirements,db,false);
 console.log(JSON.stringify({synced:done.length,retired:retired.filter(r=>r.changed).length,changed:done.filter(d=>d.changed).length}));
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(e instanceof JudgmentError&&e.code==='invalid_parameter'?2:1);});
