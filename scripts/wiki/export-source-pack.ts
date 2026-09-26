/**
 * WP-B2: export public Sources + in-scope companies for the Brain wiki generator.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> npx tsx scripts/wiki/export-source-pack.ts --out /abs/path/pack.json
 * Local/dev databases only (service-role client). Prints counts, never source text.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getServiceResearchCtx } from '../../src/lib/research/service';
import { buildWikiSourcePack } from '../../src/lib/research/wiki/source-pack';

function producerCommit(): string {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() || 'unknown'; } catch { return 'unknown'; }
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
  if (!out || !path.isAbsolute(out) || args.length !== 2) { console.error('usage: export-source-pack.ts --out /abs/path/pack.json'); process.exit(2); }
  const ctx = getServiceResearchCtx();
  const { pack, stats } = await buildWikiSourcePack(ctx, { producerCommit: producerCommit() });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack), { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({ out, pack_hash: pack.pack_hash, entity_table_version: pack.entity_table_version, ...stats }, null, 2));
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
