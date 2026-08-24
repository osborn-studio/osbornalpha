/**
 * Research OS seed script — run locally with:
 *   RESEARCH_OWNER_USER_ID=<owner auth.users id> npx tsx scripts/research-seed.ts
 * Uses the service-role Supabase client (see src/lib/research/service.ts); the
 * owner id is required (the script exits with a clear message if unset).
 * Idempotent: safe to run repeatedly.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getServiceResearchCtx } from '../src/lib/research/service';
import { seedResearchData } from '../src/lib/research/seed';
import { listEntities } from '../src/lib/research/entities';
import { loadAxioms } from '../src/lib/research/memos';

async function main() {
  const ctx = getServiceResearchCtx();
  const result = await seedResearchData(ctx);
  const [entities, axioms] = await Promise.all([listEntities(ctx), loadAxioms(ctx)]);
  console.log(
    `[research-seed] upserted ${result.companies} companies, ${result.themes} themes, ${result.axioms} axioms`,
  );
  console.log(`[research-seed] totals: entities=${entities.length} axioms=${axioms.length}`);
}

void main();
