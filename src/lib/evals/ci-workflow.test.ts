// src/lib/evals/ci-workflow.test.ts
// The `# F6` block of .github/workflows/ci.yml (spec §4.4, §7.3): full history, the gold/lock/diff/redact step, and the reports/evals artifact.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const yml=readFileSync('.github/workflows/ci.yml','utf8');
const lines=yml.split('\n');

describe('ci.yml F6 block',()=>{
 it('has balanced # F6 begin / # F6 end markers',()=>{
  expect(lines.filter(l=>l.trim()==='# F6 begin').length).toBe(3);
  expect(lines.filter(l=>l.trim()==='# F6 end').length).toBe(3);
 });
 it('checks out the full history',()=>{
  const at=lines.findIndex(l=>l.includes('uses: actions/checkout@v4'));
  expect(lines.slice(at,at+5).join('\n')).toMatch(/with:\n\s+# F6 begin\n\s+fetch-depth: 0\n\s+# F6 end/);
 });
 it('computes the base per event and runs every gold check',()=>{
  expect(yml).toContain('git merge-base "origin/$BASE_REF" HEAD');
  expect(yml).toContain('BEFORE: ${{ github.event.before }}');
  expect(yml).toContain('0000000000000000000000000000000000000000');
  expect(yml).toContain('git merge-base origin/main HEAD');
  expect(yml).toContain('npx tsx scripts/evals/validate.ts "${ARGS[@]}"');
  expect(yml).toContain('ARGS=(--gold --lock --redact)');
  expect(yml).toContain('ARGS+=(--gold-diff "$BASE")');
  expect(yml).toContain('$GITHUB_STEP_SUMMARY');
 });
 it('a failed merge-base on pull_request writes a summary line and fails',()=>{
  expect(yml).toContain('gold-diff cannot run: no merge-base with origin/$BASE_REF');
 });
 it('uploads reports/evals/** with the database summaries',()=>{
  const at=lines.findIndex(l=>l.includes('reports/migration-rehearsal.json'));
  expect(lines.slice(at,at+4).map(l=>l.trim())).toEqual(['reports/migration-rehearsal.json','# F6 begin','reports/evals/**','# F6 end']);
 });
});
