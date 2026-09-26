/**
 * WP-A6: run the three-backend fan-out over recent sources and write judgments to the ledger.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=postgres://…@127.0.0.1/… \
 *   [TYPESAFE_API_KEY=…] [LLM_PROVIDER=deepseek DEEPSEEK_API_KEY=…] npx tsx scripts/research-fanout.ts [--since ISO] [--dry-run]
 * Reads Source/thesis/entity rows with the service Supabase client; the ledger pool accepts local databases only
 * (S4 acceptance guard). Private sources never reach an external model. Never writes thesis events.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getServiceResearchCtx } from '../src/lib/research/service';
import { trustedPlatformLlm } from '../src/lib/research/memos';
import { ruleBackend } from '../src/lib/research/fanout/backends/rule';
import { createDeepseekBackend } from '../src/lib/research/fanout/backends/deepseek';
import { createJevBackend } from '../src/lib/research/fanout/backends/jev';
import { readBudgetConfig } from '../src/lib/research/fanout/budget';
import { runFanout } from '../src/lib/research/fanout/run';

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined;
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const ctx = getServiceResearchCtx();
  const budget = readBudgetConfig();
  const hasLlm = !!(process.env.LLM_PROVIDER || process.env.DEEPSEEK_API_KEY);
  const jevKey = process.env.TYPESAFE_API_KEY?.trim() || undefined;
  console.log(`[fanout] backends: rule, llm_deepseek=${hasLlm ? 'on' : 'off (no platform LLM env)'}, jev=${jevKey ? 'on (jev-1.13.0)' : 'off (no TYPESAFE_API_KEY)'}; budget ${budget.daily_budget_micros} µ$/day`);
  if (args.includes('--dry-run')) return;
  const summary = await runFanout({
    ctx, actor: { userId: owner, kind: 'agent' },
    backends: {
      rule: ruleBackend,
      deepseek: hasLlm ? createDeepseekBackend({ llm: trustedPlatformLlm, microsPer1kTokens: budget.deepseek_micros_per_1k }) : null,
      jev: createJevBackend({ apiKey: jevKey, microsPer1kTokens: budget.jev_micros_per_1k }),
    },
    escalate: hasLlm ? trustedPlatformLlm : null,
    sinceIso: since, budget,
  });
  console.log(JSON.stringify(summary, null, 2));
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
