/** Offline aligned evidence check; no credentials, environment loader, network or database.
 * Exit 0 = numeric thresholds met, 1 = unmet, 2 = invalid input. Neither 0 nor any output
 * approves comparability, source rights, I-3 readiness or publication. Candidate mapping only.
 * Input: {query: {runId, code, metric, officialMetric, expectedDates}, computed: [], official: []}.
 * See src/lib/industry/VALUATION-PREPARATION.md for the evidence contract and remaining gates.
 */
import {readFileSync} from 'node:fs';
import {diagnoseAlignedValuationSeries} from '../../src/lib/industry/valuation-preparation';

try {
 const args = process.argv.slice(2);
 if (args.length !== 1) throw new Error('invalid_arguments');
 const input = JSON.parse(readFileSync(args[0], 'utf8'));
 if (!input || typeof input !== 'object' || !input.query || typeof input.query !== 'object' ||
  !Array.isArray(input.computed) || !Array.isArray(input.official)) throw new Error('invalid_shape');
 const result = diagnoseAlignedValuationSeries(input.query, input.computed, input.official);
 // Counts and diagnostic booleans only: never echo source rows, selectors, or error payloads.
 console.log(JSON.stringify(result, null, 2));
 process.exitCode = result.thresholdsMet ? 0 : 1;
} catch {
 console.error('invalid_aligned_reconciliation_input; usage: aligned-reconciliation-check.ts <input.json>');
 process.exitCode = 2;
}
