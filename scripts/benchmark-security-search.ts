import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const WARMUP_RUNS = 20;
const MEASURED_RUNS = 200;

const exactQueries = (process.env.SECURITY_BENCHMARK_EXACT ?? '002463,00700,AAPL,BABA')
  .split(',').map((query) => query.trim()).filter(Boolean);
const nameQueries = (process.env.SECURITY_BENCHMARK_NAMES ?? '沪电股份,腾讯控股,Apple,Alibaba,hdgf')
  .split(',').map((query) => query.trim()).filter(Boolean);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return Number(sorted[index].toFixed(2));
}

async function search(query: string): Promise<number> {
  const startedAt = performance.now();
  const { data, error } = await client.rpc('search_securities', { p_query: query, p_limit: 10 });
  if (error) throw new Error(`search_securities failed for ${query}: ${error.message}`);
  if (!data?.length) throw new Error(`Benchmark query returned no identity: ${query}`);
  return performance.now() - startedAt;
}

async function measure(queries: string[]) {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    await search(queries[index % queries.length]);
  }
  const durations: number[] = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    durations.push(await search(queries[index % queries.length]));
  }
  return {
    samples: durations.length,
    warmups_discarded: WARMUP_RUNS,
    p50_ms: percentile(durations, 0.5),
    p95_ms: percentile(durations, 0.95),
  };
}

async function main() {
  const exact = await measure(exactQueries);
  const name_or_pinyin = await measure(nameQueries);
  const output = {
    target: new URL(url!).host,
    exact,
    name_or_pinyin,
    thresholds_ms: { exact_p95: 200, name_or_pinyin_p95: 300 },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (exact.p95_ms > 200 || name_or_pinyin.p95_ms > 300) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Security search benchmark failed.'}\n`);
  process.exitCode = 1;
});
