import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (file: string) => readFileSync(`supabase/migrations/${file}.sql`, 'utf8');
const migration = '20261210093000_usage_feature_topic_summary';
const lifecycle = '20260728130000_usage_run_lifecycle';
const budget = '20260728140000_cap_exempt_platform_audit';
const definition = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
};

it.each([
  ['reserve_llm_daily_budget', budget],
  ['create_cap_exempt_llm_audit', budget],
  ['begin_usage_run', lifecycle],
  ['finalize_usage_run', lifecycle],
  ['record_usage_event', lifecycle],
])('preserves %s except for the feature list', (name, source) => {
  const expected = definition(read(source), name).replace("'brief_preview')", "'brief_preview', 'topic_summary')");
  expect(definition(read(migration), name)).toBe(expected);
});

it('replaces both named feature constraints', () => {
  const sql = read(migration);
  expect(sql.match(/add constraint /gi)).toHaveLength(2);
  for (const table of ['usage_events', 'llm_cost_reservations']) {
    expect(sql).toContain(`add constraint ${table}_feature_check`);
  }
});
