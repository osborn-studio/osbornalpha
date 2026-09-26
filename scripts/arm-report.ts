/**
 * WP-E4: §10.1 class ③ market results per arm (facts only, resolved windows).
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=… npx tsx scripts/arm-report.ts [--since YYYY-MM-DD] [--json]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { loadArmRows } from '../src/lib/research/s6/arm-report-db';
import { renderArmMarkdown, summarizeArms } from '../src/lib/research/s6/arm-report';
import { closeS4Pool } from '../src/lib/research/s4/db';

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined;
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const rows = await loadArmRows({ userId: owner, kind: 'agent' }, { since });
  const summary = summarizeArms(rows);
  console.log(args.includes('--json') ? JSON.stringify({ decisions: rows.length, summary }, null, 2) : `${rows.length} decisions\n\n${renderArmMarkdown(summary)}`);
  await closeS4Pool();
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
