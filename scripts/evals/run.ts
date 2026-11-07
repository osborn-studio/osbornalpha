/**
 * F6 evaluation runner (spec §7.1). The logic lives in src/lib/evals/cli/run-cli.ts; this file wires stdio and the exit code.
 *
 *   npx tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set src/lib/evals/fixtures/gold/facts/synthetic-us.json --mode ci
 *   node --env-file=.env.local --import tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set <gold.json> --mode report \
 *        [--write-db [--verify-artifacts] [--verify-sources]] [--case <id>]... [--limit N] [--out <dir>]
 *   node --env-file=.env.local --import tsx scripts/evals/run.ts --kind official_reconciliation --module facts --mode report --write-db --resume <run_id>
 *
 * ci: the F6 frozen world (the S4_TEST_STATE test database when that variable names a state file, else memory); never
 * writes tables; report under reports/evals/. report: production anon (unprivileged). --write-db: production
 * service_role (privileged reader, dq_eval_runs / dq_eval_case_results). One JSON receipt line on stdout.
 * Exit: gate pass 0 / fail 1 / incomplete 3; usage errors and refusals 2; report or store failures 1.
 * tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {runCli} from '../../src/lib/evals/cli/run-cli';

runCli(process.argv.slice(2),{stdout:l=>process.stdout.write(`${l}\n`),stderr:l=>process.stderr.write(`${l}\n`)})
 .then(code=>process.exit(code),e=>{process.stderr.write(`${e instanceof Error?e.stack??e.message:String(e)}\n`);process.exit(1);});
