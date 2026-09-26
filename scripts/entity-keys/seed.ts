/**
 * WP-A2: write the first cohort into the owner's entity tables (idempotent) and print the table version.
 *   RESEARCH_OWNER_USER_ID=<owner auth.users id> npx tsx scripts/entity-keys/seed.ts
 * Uses the service-role Supabase client like scripts/research-seed.ts. Local/dev databases only.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getServiceResearchCtx } from '../../src/lib/research/service';
import { seedEntityKeys } from '../../src/lib/research/entity-keys/seed';
import { entityTableVersion } from '../../src/lib/research/entity-keys/store';

async function main() {
  const ctx = getServiceResearchCtx();
  const result = await seedEntityKeys(ctx);
  console.log(`[entity-keys] upserted ${result.companies} companies, ${result.securities} securities`);
  console.log(`[entity-keys] entity_table_version=${await entityTableVersion(ctx)}`);
}
void main();
