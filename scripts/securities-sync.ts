import type { SecurityUniverse } from '../src/lib/securities/model';
import { ALL_SECURITY_SCOPES, syncSecurityScopes } from '../src/lib/securities/sync/service';

interface CliOptions {
  scopes: SecurityUniverse[];
  dryRun: boolean;
  asOf: string;
  json: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const dryRunFlag = args.includes('--dry-run');
  const applyFlag = args.includes('--apply');
  if (dryRunFlag && applyFlag) throw new Error('Choose either --dry-run or --apply.');

  const scopeIndex = args.indexOf('--scope');
  const requested = scopeIndex >= 0 ? args[scopeIndex + 1] : 'all';
  if (!requested) throw new Error('--scope requires a value.');
  const scopes = requested === 'all' ? ALL_SECURITY_SCOPES : [requested as SecurityUniverse];
  if (scopes.some((scope) => !ALL_SECURITY_SCOPES.includes(scope))) throw new Error(`Unknown scope: ${requested}`);

  const asOfIndex = args.indexOf('--as-of');
  const asOf = asOfIndex >= 0 ? args[asOfIndex + 1] : new Date().toISOString().slice(0, 10);
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('--as-of must use YYYY-MM-DD.');
  return { scopes, dryRun: !applyFlag, asOf, json: args.includes('--json') };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = await syncSecurityScopes({ scopes: options.scopes, dryRun: options.dryRun, asOf: options.asOf });
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ mode: options.dryRun ? 'dry-run' : 'apply', as_of: options.asOf, results }, null, 2)}\n`);
  } else {
    console.log(`Securities sync ${options.dryRun ? 'dry-run' : 'apply'} (${options.asOf})`);
    for (const result of results) {
      const counts = result.validation?.counts;
      console.log([
        result.scope,
        result.status,
        counts ? `securities=${counts.securities} aliases=${counts.aliases} memberships=${counts.memberships}` : '',
        result.validation ? `checksum=${result.validation.checksum}` : '',
        result.write ? `inserted=${result.write.inserted_count} updated=${result.write.updated_count} deactivated=${result.write.deactivated_count}` : '',
        result.error_code ? `error=${result.error_code}` : '',
      ].filter(Boolean).join(' '));
      for (const error of result.validation?.errors ?? []) console.log(`  ${error.code}: ${error.message}`);
    }
  }
  if (results.some((result) => result.status !== 'success')) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Securities sync failed.');
  process.exitCode = 1;
});
