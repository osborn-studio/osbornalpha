import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const directory = 'supabase/migrations';
const read = (file: string) => readFileSync(`${directory}/${file}`, 'utf8');
const migration = '20261210093000_usage_feature_topic_summary.sql';
const sql = read(migration);
const history = new Map<string, { file: string; action: string; start: number }>();
const events = /^[ \t]*(create(?:\s+or\s+replace)?|drop)\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(/gim;

for (const file of readdirSync(directory).filter(file => file.endsWith('.sql') && file < migration).sort()) {
  for (const match of read(file).matchAll(events)) {
    history.set(match[2].toLowerCase(), { file, action: match[1].toLowerCase(), start: match.index! });
  }
}

const creates = [...sql.matchAll(events)].filter(match => match[1].toLowerCase().startsWith('create'));
const definition = (source: string, start: number) => {
  const end = source.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
};

it('keeps the retired billing writer absent', () => {
  expect(/record_usage_event/i.test(sql), 'migration mentions record_usage_event').toBe(false);
});

it('only replaces functions that still exist', () => {
  for (const match of creates) {
    const name = match[2].toLowerCase();
    const latest = history.get(name);
    expect(latest, name).toBeDefined();
    expect(latest!.action, `${name} in ${latest!.file}`).not.toBe('drop');
  }
});

it.each([
  'reserve_llm_daily_budget',
  'create_cap_exempt_llm_audit',
  'begin_usage_run',
  'finalize_usage_run',
])('preserves %s except for the feature list', name => {
  const latest = history.get(name)!;
  const expected = definition(read(latest.file), latest.start).replace("'brief_preview')", "'brief_preview', 'topic_summary')");
  const matches = creates.filter(match => match[2].toLowerCase() === name);
  expect(matches).toHaveLength(1);
  expect(definition(sql, matches[0].index!)).toBe(expected);
});

it('replaces both named feature constraints', () => {
  expect(sql.match(/add constraint /gi)).toHaveLength(2);
  for (const table of ['usage_events', 'llm_cost_reservations']) {
    expect(sql).toContain(`add constraint ${table}_feature_check`);
  }
});
