/**
 * WP-A4: collect official disclosures for in-scope companies into research_source_documents.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> npx tsx scripts/research-collect.ts [--source edgar,cninfo,hkexnews] [--since ISO] [--until ISO] [--dry-run]
 * Uses the service-role Supabase client (local/dev databases). Exit code 1 when any source reports failures
 * (the other sources' rows are already written). Set EDGAR_USER_AGENT to your own contact string.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getServiceResearchCtx } from '../src/lib/research/service';
import { listEntityKeys } from '../src/lib/research/entity-keys/store';
import { collectAll, companiesFromEntityKeys } from '../src/lib/research/ingest/collectors/run';
import type { CollectorSource } from '../src/lib/research/ingest/collectors/types';

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const owner = process.env.RESEARCH_OWNER_USER_ID;
  if (!owner) { console.error('RESEARCH_OWNER_USER_ID is required'); process.exit(2); }
  const ctx = getServiceResearchCtx();
  const companies = companiesFromEntityKeys(await listEntityKeys(ctx));
  const sources = flag('--source')?.split(',').map(s => s.trim()).filter(Boolean) as CollectorSource[] | undefined;
  const since = flag('--since') ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  console.log(`[collect] ${companies.length} in-scope companies; sources=${sources?.join(',') ?? 'edgar,cninfo,hkexnews'}; since=${since}`);
  if (args.includes('--dry-run')) return;
  const result = await collectAll({ ctx, companies, since, until: flag('--until'), sources });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
