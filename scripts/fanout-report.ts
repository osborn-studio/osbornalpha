/**
 * WP-A6: §10.1 class ① report over the owner's judgments and labels.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=… npx tsx scripts/fanout-report.ts [--since ISO] [--json]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { loadReportRows } from '../src/lib/research/fanout/report-db';
import { renderMarkdown, summarize } from '../src/lib/research/fanout/report';
import { closeS4Pool } from '../src/lib/research/s4/db';

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined;
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const rows = await loadReportRows({ userId: owner, kind: 'agent' }, since);
  const metrics = summarize(rows);
  console.log(args.includes('--json') ? JSON.stringify({ rows: rows.length, metrics }, null, 2) : `${rows.length} judgments\n\n${renderMarkdown(metrics)}`);
  await closeS4Pool();
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
