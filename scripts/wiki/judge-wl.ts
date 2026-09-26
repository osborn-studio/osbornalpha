/**
 * WP-B3: answer the WL question for Brain lint candidate pairs with Jev (paid; operator step).
 *   RESEARCH_OWNER_USER_ID=<owner uuid> TYPESAFE_API_KEY=… npx tsx scripts/wiki/judge-wl.ts --pairs /abs/pairs.json --out /abs/answers.json [--max-cost-usd 1.0] [--dry-run]
 * Refuses the whole file if any referenced Source is not public in the local/dev database.
 * Merges into an existing --out for the same pairs file; a different pairs file is rejected.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getServiceResearchCtx } from '../../src/lib/research/service';
import { loadPairsDocument, runJudgeWl, verifyPublicSources } from '../../src/lib/research/wiki/judge-wl';
import type { WlAnswersDocument } from '../../src/lib/research/wiki/wl';

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const pairsPath = flag('--pairs'); const out = flag('--out'); const dryRun = args.includes('--dry-run');
  const maxCostUsd = flag('--max-cost-usd') === undefined ? 1 : Number(flag('--max-cost-usd'));
  if (!pairsPath || !out || !path.isAbsolute(pairsPath) || !path.isAbsolute(out) || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    console.error('usage: judge-wl.ts --pairs /abs/pairs.json --out /abs/answers.json [--max-cost-usd X] [--dry-run]'); process.exit(2);
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!dryRun && !apiKey) { console.error('TYPESAFE_API_KEY is required for a real run'); process.exit(1); }
  const pairs = loadPairsDocument(JSON.parse(readFileSync(pairsPath, 'utf8')));
  const ctx = getServiceResearchCtx();
  const { checked } = await verifyPublicSources(ctx, pairs);
  const existing = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as WlAnswersDocument) : null;
  const result = await runJudgeWl({ pairs, existing, fetch, apiKey: apiKey ?? '', maxCostUsd, now: () => new Date().toISOString(), dryRun });
  if (!dryRun) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(result.document, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
  console.log(JSON.stringify({ out, dry_run: dryRun, public_sources_checked: checked, plan: result.plan,
    judged: result.judged ? { answered: result.judged.answers.length, spent_usd: result.judged.spent_micros / 1_000_000, stopped: result.judged.stopped, errors: result.judged.errors.length } : null }, null, 2));
  if (result.judged && result.judged.errors.length > 0) process.exit(1);
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
