/**
 * C1: calibration refit report (§10.1 class ①, §10.2 targets, §10.3 stop rules) over the owner's
 * judgments and labels. Writes docs/calibration/<date>.{json,md} (or --out) — no DB writes, no model calls.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=… npx tsx scripts/calibration-report.ts --out /abs/docs/calibration [--since ISO] [--baseline /abs/prev.json]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { runCalibrationCli } from '../src/lib/research/fanout/calibration';
import { loadReportRows } from '../src/lib/research/fanout/report-db';
import { closeS4Pool } from '../src/lib/research/s4/db';

async function main() {
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const result = await runCalibrationCli(process.argv.slice(2), { load: since => loadReportRows({ userId: owner, kind: 'agent' }, since) });
  console.log(result.output);
  await closeS4Pool();
  process.exit(result.exitCode);
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
