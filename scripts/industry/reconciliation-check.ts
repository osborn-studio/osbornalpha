/** Offline only; no environment file, credentials, network or database required.
 * node --import tsx scripts/industry/reconciliation-check.ts <input.json>
 * Exit 0: numeric thresholds met (NOT publication eligibility), 1: not met, 2: invalid input.
 * Input contains private observations; stdout contains only diagnostic counts and booleans.
 */
import {readFileSync} from 'node:fs';
import {analyzeValuationReconciliation} from '../../src/lib/industry/valuation-reconciliation';

try {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error('invalid_arguments');
  const result = analyzeValuationReconciliation(JSON.parse(readFileSync(args[0], 'utf8')));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.thresholdsMet ? 0 : 1;
} catch {
  console.error('invalid_reconciliation_input; usage: reconciliation-check.ts <input.json>');
  process.exitCode = 2;
}
