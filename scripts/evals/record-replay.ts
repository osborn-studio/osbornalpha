/**
 * Record replay expectations (spec §5.3.1, §5.3.2, §5.3.3, §14).
 *
 *   npx tsx scripts/evals/record-replay.ts --mode frozen|live --case <id> [--case <id> ...] [--supersede <ledger_id>] [--file <path>] [--ledger <path>]
 *
 * Append-only (replay/record.ts::applyRecording): a draft case (expected null) is recorded; a recorded
 * case whose projection hash is unchanged stays untouched; a changed one is refused
 * (replay_rerecord_refused, exit 2) unless --supersede (exactly one --case) names an approved ledger entry
 * for this case and mode with before_hash = stored hash and after_hash = new hash.
 * frozen: needs S4_TEST_STATE (a freshly migrated local database — run through .claude/scratch/db-run.ts);
 * the draft setup is sealed with replay/setup.ts::sealSetupFromPaths, the database is built once per setup_sha256
 * with buildFrozenDb (a fresh isolated database per setup, dropped on exit), and the projection is read over that database (projections/facts.ts::projectRequest).
 * live: production over the anon client (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, e.g.
 * node --env-file=.env.local --import tsx …), recording fact_state_rev after the projection.
 * Refuses a dirty checkout (EvalError dirty_tree, exit 2 — evaluator_code_version must name committed code; Codex plan
 * round 1 P1-7): commit the code and the drafts first, then record, then commit the recording.
 * The file is written once, only after every requested case succeeded. Prints "<action> <case_id> <hash>".
 * Exit 0 ok, 2 refused or bad arguments, 1 any other failure.
 */
import {runRecordCli} from '../../src/lib/evals/replay/record-cli';

runRecordCli(process.argv.slice(2),{log:l=>console.log(l),err:l=>console.error(l)}).then(code=>{process.exitCode=code;});
