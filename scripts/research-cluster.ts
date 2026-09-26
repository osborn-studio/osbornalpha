/**
 * WP-A5: cluster the owner's sources (URL → title → MinHash) and optionally align them to A2 entities.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> npx tsx scripts/research-cluster.ts [--since ISO] [--align] [--jaccard 0.8]
 * Writes only enrichment fields (cluster_id, cluster_first, entity_ids) and alignment rows; audits cluster.run / align.run.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getServiceResearchCtx } from '../src/lib/research/service';
import { runAlign, runCluster } from '../src/lib/research/cluster/run';

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const since = arg('--since');
  const jaccardArg = arg('--jaccard');
  const jaccard = jaccardArg === undefined ? undefined : Number(jaccardArg);
  if (jaccard !== undefined && !(jaccard > 0 && jaccard <= 1)) { console.error('--jaccard must be in (0, 1]'); process.exit(2); }
  const ctx = getServiceResearchCtx();
  const cluster = await runCluster(ctx, { since, jaccard });
  const align = args.includes('--align') ? await runAlign(ctx, { since }) : null;
  console.log(JSON.stringify({ cluster, align }, null, 2));
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
