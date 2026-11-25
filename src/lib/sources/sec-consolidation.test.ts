import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { secPacer, SEC_MIN_INTERVAL_MS } from '../facts/providers/shared';
import { fetchSubmissionsSic } from '../industry/providers/sec-sic';
import { politeHttp, HOST_POLICY, makeDocBudget } from '../documents/sources/shared';
import { sourceByName } from './catalog';

beforeEach(() => secPacer.reset());
afterEach(() => { secPacer.reset(); vi.restoreAllMocks(); });

function sources(dir: string): string[] {
  return readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.[cm]?[jt]sx?$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
  });
}

it('has no raw fetch in SEC requesters, including callers receiving URLs from other modules', () => {
  const offenders: string[] = [];
  for (const path of [...sources('src'), ...sources('scripts')]) {
    if (path === 'src/lib/sources/sec-transport.ts') continue;
    const source = readFileSync(path, 'utf8');
    if (!/(?:data|www)\.sec\.gov|\b(?:secGet|secPacer)\b/.test(source) &&
        !path.endsWith('/research/ingest/collectors/shared.ts')) continue;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && /(?:^|\W)(?:fetch|doFetch)\s*\)*$/.test(node.expression.getText(file))) {
        // The submissions client's domain method takes a CIK. Generic HTTP clients can
        // dispatch directly only on the non-SEC branch of their per-hop host check.
        const callee = node.expression.getText(file);
        const branch = node.parent;
        if (!/^submissionsClient\(.*\)\.fetch$/.test(callee) &&
            !(ts.isConditionalExpression(branch) && branch.whenFalse === node &&
              branch.condition.getText(file) === 'isSec' && branch.whenTrue.getText(file).startsWith('secGet('))) offenders.push(path);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  expect(offenders).toEqual([]);
});

it('shares the catalogue interval', () => {
  expect(SEC_MIN_INTERVAL_MS).toBe(sourceByName('sec')?.pacing?.minIntervalMs);
});

it('spaces SIC and document starts on one clock', async () => {
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const starts: number[] = [];
  const fetch = async () => { starts.push(now); return new Response('{"cik":320193}'); };
  await fetchSubmissionsSic('320193', { fetch });
  const http = politeHttp({ ...HOST_POLICY.edgar, fetch, clock: () => now, sleep: async ms => { now += ms; } });
  await http.getText('https://www.sec.gov/x', makeDocBudget(null));
  expect(starts).toEqual([1000,1150]);
});

it('refuses foreign and malformed URLs before dispatch', async () => {
  const { secGet } = await import('./sec-transport');
  const fetch = vi.fn();
  for (const url of ['https://www.sec.gov.example.org/x', 'bad url', 'https://data.sec.gov:123/x']) {
    await expect(secGet(url, {fetch})).rejects.toThrow(/^sec_host_rejected$/);
  }
  expect(fetch).not.toHaveBeenCalled();
});
