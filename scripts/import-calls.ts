/**
 * WP-A10: one-time mapping of the personal hiphon-pm call journal into the judgment ledger.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=… \
 *   npx tsx scripts/import-calls.ts ~/.hiphon-pm/calls.jsonl [--scorecard ~/.hiphon-pm/scorecard.json] [--dry-run]
 * Reads the journal only from the path given; nothing is copied into the repository or sent anywhere.
 * Each call → DRAFT historical thesis + human_baseline decision frozen at the call time; manual_close → outcome.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { readFileSync } from 'node:fs';
import { getServiceResearchCtx } from '../src/lib/research/service';
import { createThesis, listTheses } from '../src/lib/research/theses';
import { recordDecision, recordOutcome } from '../src/lib/research/s4/ledger';
import { closeS4Pool, transaction } from '../src/lib/research/s4/db';
import { importCalls, type Scorecard } from '../src/lib/research/ledger/calls-import';

async function main() {
  const args = process.argv.slice(2);
  const journalPath = args.find(a => !a.startsWith('--'));
  if (!journalPath) { console.error('usage: import-calls.ts <calls.jsonl> [--scorecard file] [--dry-run]'); process.exit(2); }
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const scorecardPath = args.includes('--scorecard') ? args[args.indexOf('--scorecard') + 1] : undefined;
  const scorecard = scorecardPath ? JSON.parse(readFileSync(scorecardPath, 'utf8')) as Scorecard : null;
  const ctx = getServiceResearchCtx(), actor = { userId: owner, kind: 'human' as const };
  const result = await importCalls({
    journal: readFileSync(journalPath, 'utf8'), scorecard, dryRun: args.includes('--dry-run'),
    theses: { find: async title => (await listTheses(ctx)).find(t => t.title === title)?.id ?? null, create: async input => (await createThesis(ctx, input)).id },
    ledger: { existingCardIds: async () => new Set<string>((await transaction(actor, db => db.query("select card_id from public.research_decisions where user_id=$1 and card_id like 'hiphon:%'", [owner]))).rows.map((r: { card_id: string }) => r.card_id)),
      recordDecision: input => recordDecision(actor, input), recordOutcome: input => recordOutcome(actor, input) },
  });
  console.log(JSON.stringify(result, null, 2));
  await closeS4Pool();
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
