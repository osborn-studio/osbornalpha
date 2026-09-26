/**
 * WP-A5: correctness report over a human-labeled sample (from scripts/cluster-sample.ts).
 *   npx tsx scripts/cluster-report.ts sample-labeled.csv [--json]
 * Labels are y/n in label_cluster_correct / label_alignment_correct; blanks are unlabeled. Reports Wilson 95% intervals.
 */
import { readFileSync } from 'node:fs';
import { parseCsv, renderLabelSummary, summarizeLabels } from '../src/lib/research/cluster/report';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: cluster-report.ts <labeled.csv> [--json]'); process.exit(2); }
const summary = summarizeLabels(parseCsv(readFileSync(file, 'utf8')));
console.log(args.includes('--json') ? JSON.stringify(summary, null, 2) : renderLabelSummary(summary));
