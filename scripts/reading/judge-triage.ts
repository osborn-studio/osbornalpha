/**
 * WP-B4: Jev shadow triage of Brain reading-plan items against the active theses (paid; operator step).
 *   RESEARCH_OWNER_USER_ID=<owner uuid> TYPESAFE_API_KEY=… npx tsx scripts/reading/judge-triage.ts --items /abs/items.json --out /abs/answers.json [--max-cost-usd 1.0] [--dry-run]
 * Brain already applied its export policy; this script never reads Brain's vault or inbox.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getServiceResearchCtx } from '../../src/lib/research/service';
import { listTheses } from '../../src/lib/research/theses';
import { loadItemsDocument, runJudgeTriage, thesesForTriage } from '../../src/lib/research/reading/judge-triage';
import type { TriageAnswersDocument } from '../../src/lib/research/reading/triage';

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const itemsPath = flag('--items'); const out = flag('--out'); const dryRun = args.includes('--dry-run');
  const maxCostUsd = flag('--max-cost-usd') === undefined ? 1 : Number(flag('--max-cost-usd'));
  if (!itemsPath || !out || !path.isAbsolute(itemsPath) || !path.isAbsolute(out) || path.resolve(itemsPath) === path.resolve(out) || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    console.error('usage: judge-triage.ts --items /abs/items.json --out /abs/answers.json [--max-cost-usd X] [--dry-run]'); process.exit(2);
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!dryRun && !apiKey) { console.error('TYPESAFE_API_KEY is required for a real run'); process.exit(1); }
  const items = loadItemsDocument(JSON.parse(readFileSync(itemsPath, 'utf8')));
  const theses = thesesForTriage(await listTheses(getServiceResearchCtx()));
  const existing = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as TriageAnswersDocument) : null;
  const result = await runJudgeTriage({ items, theses, existing, fetch, apiKey: apiKey ?? '', maxCostUsd, now: () => new Date().toISOString(), dryRun });
  if (!dryRun) { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result.document, null, 2), { encoding: 'utf8', mode: 0o600 }); }
  console.log(JSON.stringify({ out, dry_run: dryRun, plan: result.plan,
    judged: result.judged ? { answered: result.judged.answers.length, spent_usd: result.judged.spent_micros / 1_000_000, stopped: result.judged.stopped, errors: result.judged.errors.length } : null }, null, 2));
  if (result.judged && result.judged.errors.length > 0) process.exit(1);
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
