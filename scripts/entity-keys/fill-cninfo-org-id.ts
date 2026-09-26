/**
 * WP-A4/A2: fill missing A-share cninfo orgIds in first-cohort.json from 巨潮 topSearch (public, exact code match).
 *   npx tsx scripts/entity-keys/fill-cninfo-org-id.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveOrgId, type OrgLookup } from '../../src/lib/research/ingest/collectors/cninfo';
import { applyOrgIds } from '../../src/lib/research/ingest/collectors/fill-cninfo-org-id';
import type { CohortCompany, CohortFile } from '../../src/lib/research/entity-keys/types';

const FILE = new URL('../../src/lib/research/entity-keys/first-cohort.json', import.meta.url);

async function main() {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as CohortFile;
  const lookups: Record<string, OrgLookup> = {};
  for (const c of file.companies as CohortCompany[]) {
    if (c.home_market !== 'A' || c.keys.cninfo_org_id) continue;
    const code = /^(\d{6})\./.exec(c.securities.find(s => s.is_primary)?.exchange_code ?? '')?.[1];
    if (!code) continue;
    const hit = await resolveOrgId(code, {});
    if (hit) lookups[code] = hit;
    console.log(`${code}: ${hit ? `${hit.orgId} (${hit.name})` : 'unresolved'}`);
    await new Promise(r => setTimeout(r, 600));
  }
  const result = applyOrgIds(file.companies as CohortCompany[], lookups, new Date().toISOString().slice(0, 10));
  console.log(`filled ${result.filled.length}, unresolved ${result.unresolved.length}${result.unresolved.length ? `: ${result.unresolved.join(' ')}` : ''}`);
  if (process.argv.includes('--write')) {
    writeFileSync(FILE, JSON.stringify({ ...file, companies: result.companies }, null, 1) + '\n');
    console.log('first-cohort.json updated');
  }
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
