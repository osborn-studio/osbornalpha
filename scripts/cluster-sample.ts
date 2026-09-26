/**
 * WP-A5: export a human-labeling sample of clustered sources.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> npx tsx scripts/cluster-sample.ts --out sample.csv [--n 100] [--seed 1]
 * Half the rows come from clusters with ≥2 members when enough exist. The two label_* columns are left blank
 * for a human (y/n); feed the labeled file to scripts/cluster-report.ts.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { writeFileSync } from 'node:fs';
import { getServiceResearchCtx } from '../src/lib/research/service';
import { listSourcesSince } from '../src/lib/research/fanout/run';
import { SAMPLE_COLUMNS, buildSampleRows, pickSample, toCsv, type SampleAlignment, type SampleSource } from '../src/lib/research/cluster/report';

const PAGE = 1000;
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const out = arg('--out');
  if (!out) { console.error('--out <file.csv> is required'); process.exit(2); }
  const n = Number(arg('--n') ?? 100); const seed = Number(arg('--seed') ?? 1);
  const ctx = getServiceResearchCtx();
  const population: SampleSource[] = (await listSourcesSince(ctx, '1970-01-01T00:00:00.000Z'))
    .filter(s => s.cluster_id !== null)
    .map(s => ({ id: s.id, title: s.title, url: s.url ?? null, cluster_id: s.cluster_id as string, cluster_first: s.cluster_first ?? null, entity_ids: s.entity_ids }));
  const sample = pickSample(population, n, seed);
  const alignments: Record<string, SampleAlignment[]> = {};
  for (let i = 0; i < sample.length; i += 200) {
    const { data, error } = await ctx.supabase.from('research_source_entity_alignments').select('source_id, entity_id, status').eq('user_id', ctx.userId).in('source_id', sample.slice(i, i + 200).map(s => s.id));
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ source_id: string; entity_id: string; status: string }>) (alignments[r.source_id] ??= []).push({ entity_id: r.entity_id, status: r.status });
  }
  const names: Record<string, string> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase.from('research_entities').select('id, name').eq('user_id', ctx.userId).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{ id: string; name: string }>;
    for (const e of page) names[e.id] = e.name;
    if (page.length < PAGE) break;
  }
  writeFileSync(out, toCsv(SAMPLE_COLUMNS, buildSampleRows(sample, population, alignments, names)), 'utf8');
  console.log(`${sample.length} rows (population ${population.length}, seed ${seed}) → ${out}`);
}
void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
