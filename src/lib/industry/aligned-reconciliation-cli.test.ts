import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe, expect, it} from 'vitest';

// Synthetic offline evidence only; callers can isolate all fixtures under their task scratch.
const scratch = join(process.env.OSSTACK_SCRATCH_ROOT ?? join(tmpdir(), 'osstack'), 'industry-aligned-cli');
const script = 'scripts/industry/aligned-reconciliation-check.ts';
function fixture(n: number) {
 const expectedDates = Array.from({length: n}, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
 return {
  query: {runId: 'private-run', code: '801780', metric: 'pe_ttm', officialMetric: 'pe', expectedDates},
  computed: expectedDates.map(trade_date => ({run_id: 'private-run', scheme: 'sw2021', version: '2021', code: '801780', metric: 'pe_ttm', trade_date, status: 'ok', value: '123.456789'})),
  official: expectedDates.map(trade_date => ({scheme: 'sw2021', version: '2021', code: '801780', metric: 'pe', trade_date, status: 'ok', value: '123.456789', observation_id: `private-${trade_date}`, observed_at: '2026-11-01T00:00:00Z'})),
 };
}
function run(input: unknown) {
 mkdirSync(scratch, {recursive: true});
 const directory = mkdtempSync(join(scratch, 'aligned-cli-'));
 try {
  const file = join(directory, 'input.json');
  writeFileSync(file, JSON.stringify(input));
  return spawnSync(process.execPath, ['--import', 'tsx', script, file], {encoding: 'utf8', timeout: 10_000});
 } finally { rmSync(directory, {recursive: true, force: true}); }
}
describe('offline aligned reconciliation command', () => {
 it('reports numeric success without exposing inputs or claiming readiness', () => {
  const result = run(fixture(24));
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({assessment: 'diagnostic_only', nPairs: 24, thresholdsMet: true});
  for (const privateValue of ['123.456789', 'private-', '801780', '2026-10-', 'ready', 'qualified']) expect(result.stdout).not.toContain(privateValue);
 });
 it('returns 1 for a well-formed series below the 24-pair minimum', () => {
  const result = run(fixture(23));
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({nPairs: 23, thresholdsMet: false});
 });
 it('returns 2 with a fixed sanitized error for reused IDs or mismatched natural keys', () => {
  const reused = fixture(24);
  reused.official.forEach(r => { r.observation_id = 'private-reused'; });
  const wrongKey = fixture(24);
  wrongKey.official[0].code = '801120';
  for (const input of [reused, wrongKey, null, {query: {}}, {query: {}, computed: {}, official: []}]) {
   const result = run(input);
   expect(result.status).toBe(2);
   expect(result.stdout).toBe('');
   expect(result.stderr).toBe('invalid_aligned_reconciliation_input; usage: aligned-reconciliation-check.ts <input.json>\n');
  }
 });
 it('rejects missing file arguments without disclosing filesystem details', () => {
  for (const args of [[], ['/nonexistent/private-evidence.json'], ['a', 'b']]) {
   const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {encoding: 'utf8', timeout: 10_000});
   expect(result.status).toBe(2);
   expect(result.stdout).toBe('');
   expect(result.stderr).not.toContain('private-evidence');
  }
 });
});
