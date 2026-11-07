/**
 * F6 evidence validators (spec §4.4, §4.5, §7.3).
 *
 *   npx tsx scripts/evals/validate.ts [--gold] [--lock] [--gold-diff <base>] [--redact] [--availability]
 *
 * --gold       every gold set parses under its format's rules (f6: §4; legacy_plan2: §0 R5-1)
 * --availability  read-only kind/methodology inventory; diagnostic success is NOT evaluation readiness or a gate pass
 * --lock       every gold set matches lock.json (path, byte sha256, version, format) and vice versa
 * --gold-diff  committed HEAD against <base>: no case removed/renamed, changes carry a version bump
 * --redact     no credentials / e-mails / bucket paths / long note fields in F6-owned paths (redact.ts REDACT_ROOTS)
 * Task 12 adds --expert <file> [--release], --audit <dir> [--release], --manifest <file> (entries in validate/cli.ts HANDLERS).
 * Prints one JSON summary on stdout. Exit 0 when every selected check passes, 1 when a check fails, 2 for usage errors.
 */
import {runValidate} from '../../src/lib/evals/validate/cli';

runValidate(process.argv.slice(2)).then(({exitCode,output})=>{
 process.stdout.write(`${JSON.stringify(output,null,1)}\n`);
 process.exitCode=exitCode;
},e=>{process.stderr.write(`${e instanceof Error?e.stack??e.message:String(e)}\n`);process.exitCode=2;});
