/**
 * WP-A8: Friday change cards — one week of the judgment ledger → ≤5 seven-field cards.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=postgres://…@127.0.0.1/… \
 *   [LLM_PROVIDER=deepseek DEEPSEEK_API_KEY=…] npx tsx scripts/research-cards.ts [--week YYYY-MM-DD] [--dry-run]
 * Local only: the ledger lives in the S4 pool, which accepts local databases only. Private material,
 * private observations and S4 controlled copies never reach the generation model.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getServiceResearchCtx } from '../src/lib/research/service';
import { trustedPlatformLlm } from '../src/lib/research/memos';
import { runCards, weekOfMonday } from '../src/lib/research/cards/run';
import { closeS4Pool } from '../src/lib/research/s4/db';

async function main() {
  const args = process.argv.slice(2);
  const week = args.includes('--week') ? args[args.indexOf('--week') + 1] : weekOfMonday();
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const ctx = getServiceResearchCtx();
  const summary = await runCards(ctx, { userId: owner, kind: 'agent' }, { weekOf: week, llm: trustedPlatformLlm, dryRun: args.includes('--dry-run') });
  console.log(JSON.stringify(summary, null, 2));
  await closeS4Pool();
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
