/**
 * Research OS seed script — run locally with:
 *   RESEARCH_OS_ENABLED=1 npx tsx scripts/research-seed.ts
 * Idempotent: safe to run repeatedly.
 */

import { getDb } from '../src/lib/research/db';
import { seedResearchData } from '../src/lib/research/seed';

function main() {
  if (process.env.RESEARCH_OS_ENABLED !== '1') {
    // Convenience: the seed script is inherently local-only, so enable inline.
    process.env.RESEARCH_OS_ENABLED = '1';
  }
  const db = getDb();
  const result = seedResearchData(db);
  const counts = {
    entities: (db.prepare('select count(*) c from entities').get() as { c: number }).c,
    axioms: (db.prepare('select count(*) c from axioms').get() as { c: number }).c,
  };
  console.log(
    `[research-seed] upserted ${result.companies} companies, ${result.themes} themes, ${result.axioms} axioms`,
  );
  console.log(`[research-seed] totals: entities=${counts.entities} axioms=${counts.axioms}`);
}

main();
