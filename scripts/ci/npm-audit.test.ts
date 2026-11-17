import {spawnSync} from 'node:child_process';
import {readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {evaluateAudit as evaluate, type AuditReport} from './npm-audit';

const id = 'GHSA-fc5q-39xc-vjpf';
const today = '2026-11-17';
const allowlist = [{id, package: 'picomatch', path: 'node_modules/@parcel/watcher/node_modules/picomatch', installed: '4.0.5', maxVulnerable: '4.0.7', reason: 'No patched version', expires: '2026-12-01'}];
function report(fixAvailable: boolean | {name: string; version: string}, severity = 'high'): AuditReport {
  return {vulnerabilities: {picomatch: {severity, fixAvailable, nodes: ['node_modules/@parcel/watcher/node_modules/picomatch'], via: [{url: `https://github.com/advisories/${id}`}]}}};
}

let root: string;
function install(node: string, version: string) {
  mkdirSync(join(root, node), {recursive: true});
  writeFileSync(join(root, node, 'package.json'), JSON.stringify({version}));
}
function evaluateAudit(input: AuditReport, entries: typeof allowlist, date: string, latest: Record<string, string | undefined> = {picomatch: '4.0.7'}) {
  return evaluate(input, entries, date, root, {latest});
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'npm-audit-test-'));
  install('node_modules/@parcel/watcher/node_modules/picomatch', '4.0.5');
});
afterEach(() => rmSync(root, {recursive: true, force: true}));

describe('evaluateAudit', () => {
  it('blocks high findings with fixes', () => {
    expect(evaluateAudit(report(true), [], today).findings[0].status).toBe('blocking');
  });
  it.each([false, true, {name: 'picomatch', version: '4.0.7'}])('allows a matching installed version regardless of npm fix metadata: %j', fix => {
    const result = evaluateAudit(report(fix), allowlist, today);
    expect(result.findings[0].status).toBe('allowlisted(No patched version, 2026-12-01)');
    expect(result.exitCode).toBe(0);
  });
  it('allows entries through their expiry date', () => {
    const result = evaluateAudit(report(false), allowlist, '2026-12-01');
    expect(result.exitCode).toBe(0);
    expect(evaluateAudit(report(false), allowlist, '2026-12-02').exitCode).toBe(1);
  });
  it('blocks when an installed version differs', () => {
    install('node_modules/@parcel/watcher/node_modules/picomatch', '4.0.8');
    const result = evaluateAudit(report(true), allowlist, today);
    expect(result.findings[0].status).toBe('blocking');
    expect(result.exitCode).toBe(1);
    expect(result.messages.join('\n')).toContain('installed 4.0.8 differs from allowlisted 4.0.5; re-check the advisory and update or remove the entry');
  });
  it('rejects additional nodes even with the pinned version', () => {
    const input = report(true);
    input.vulnerabilities.picomatch.nodes!.push('node_modules/other/node_modules/picomatch');
    install('node_modules/other/node_modules/picomatch', '4.0.6');
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
    install('node_modules/other/node_modules/picomatch', '4.0.5');
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
    expect(evaluateAudit(input, allowlist, today).messages.join(' ')).toContain('unexpected path(s): node_modules/other/node_modules/picomatch');
  });
  it('allows a transitive row carrying the same advisory id', () => {
    const input = report(true);
    input.vulnerabilities['@parcel/watcher'] = {
      severity: 'high', fixAvailable: true, via: [{url: `https://github.com/advisories/${id}`}],
    };
    const result = evaluateAudit(input, allowlist, today);
    expect(result.exitCode).toBe(0);
    expect(result.findings.every(row => row.status.startsWith('allowlisted('))).toBe(true);
    install('node_modules/@parcel/watcher/node_modules/picomatch', '4.0.8');
    expect(evaluateAudit(input, allowlist, today).findings.every(row => row.status === 'blocking')).toBe(true);
  });
  it('keeps moderate findings below threshold', () => {
    expect(evaluateAudit(report(true, 'moderate'), [], today).findings[0].status).toBe('below-threshold');
  });
  it('does not allow unlisted or critical advisories', () => {
    expect(evaluateAudit(report(false, 'critical'), [], today).exitCode).toBe(1);
  });
  it('does not allow other advisories on the same package', () => {
    const input = report(false);
    input.vulnerabilities.picomatch.via.push({url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc'});
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
  });
  it('requires the allowlisted package to have installed nodes', () => {
    expect(evaluateAudit(report(false), [{...allowlist[0], package: 'other'}], today).exitCode).toBe(1);
  });
  it('fails for expired entries even when the advisory is absent', () => {
    expect(evaluateAudit({vulnerabilities: {}}, allowlist, '2027-01-01').exitCode).toBe(1);
  });
  it('resolves transitive findings without exempting unrelated dependencies', () => {
    const input = report(false);
    input.vulnerabilities.watcher = {severity: 'high', fixAvailable: true, via: ['picomatch']};
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(0);
    input.vulnerabilities.watcher.via.push('missing');
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
  });
  it('fails closed on cycles or missing advisory ids', () => {
    const input = report(false);
    input.vulnerabilities.picomatch.via = ['picomatch'];
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
    input.vulnerabilities.picomatch.via = [{}];
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
  });
  it('allows matching installations without fix metadata', () => {
    const input = report(false);
    delete input.vulnerabilities.picomatch.fixAvailable;
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(0);
  });
  it('fails closed when installed versions cannot be read', () => {
    const input = report(true);
    input.vulnerabilities.picomatch.nodes = [];
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
    input.vulnerabilities.picomatch.nodes = ['node_modules/missing'];
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
  });
  it('requires an installed version in each entry', () => {
    expect(() => evaluateAudit(report(true), [{...allowlist[0], installed: ''}], today)).toThrow('Invalid npm audit allowlist entry');
  });
  it('rejects failed or malformed audit responses', () => {
    expect(() => evaluateAudit({error: {}} as unknown as AuditReport, allowlist, today)).toThrow();
  });

  it.each(['4.0.8', '4.0.10', '5.0.0'])('rejects a published fix %s', version => {
    const result = evaluateAudit(report(false), allowlist, today, {picomatch: version});
    expect(result.exitCode).toBe(1);
    expect(result.messages).toContain(`a newer picomatch ${version} exists: upgrade and remove the allow-list entry`);
  });
  it.each([undefined, 'garbage'])('fails closed on latest %s', version => {
    const result = evaluateAudit(report(false), allowlist, today, {picomatch: version});
    expect(result.exitCode).toBe(1);
    expect(result.messages).toContain('could not determine the latest picomatch version');
  });
  it('rejects a replacement path with the same installed version', () => {
    const input = report(false);
    input.vulnerabilities.picomatch.nodes = ['node_modules/elsewhere/picomatch'];
    install('node_modules/elsewhere/picomatch', '4.0.5');
    const result = evaluateAudit(input, allowlist, today);
    expect(result.exitCode).toBe(1);
    expect(result.messages.join(' ')).toContain('unexpected path(s): node_modules/elsewhere/picomatch');
  });
  it.each([{path: undefined}, {path: '../outside'}, {maxVulnerable: undefined}, {maxVulnerable: 'garbage'}, {expires: '2026-02-30'}])('rejects malformed entry %j', change => {
    expect(() => evaluateAudit(report(false), [{...allowlist[0], ...change}] as typeof allowlist, today)).toThrow('Invalid npm audit allowlist entry');
  });
  it('logs unused and empty exceptions', () => {
    expect(evaluateAudit({vulnerabilities: {}}, allowlist, today).exceptions).toEqual([
      `audit exception: ${id} picomatch at ${allowlist[0].path}, expires 2026-12-01 (14 days left) unused`,
    ]);
    expect(evaluateAudit(report(false, 'moderate'), [], today).exceptions).toEqual(['audit exceptions: none']);
  });
  it('rejects missing vulnerabilities', () => {
    expect(() => evaluateAudit({} as AuditReport, [], today)).toThrow();
  });

});

describe('main offline', () => {
  function run(file = 'audit-main.json', args: string[] = []) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ci/npm-audit.ts', '--audit-file', `scripts/ci/fixtures/${file}`, '--root', root, '--today', today, '--latest', 'picomatch=4.0.7', ...args], {encoding: 'utf8'});
  }
  it('allows both rows of the recorded main report and logs before the table', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^audit exception: .*\(14 days left\)\n/);
    expect(result.stdout.match(/allowlisted\(/g)).toHaveLength(2);
  });
  it('blocks and names a second advisory', () => {
    const result = run('audit-second-advisory.json');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('other-package');
    expect(result.stdout).toContain('GHSA-aaaa-bbbb-cccc');
  });
  it.each([
    ['--today', '2026-12-02'], ['--latest', 'picomatch=4.0.8'],
    ['--latest', 'picomatch=garbage'], ['--unknown', 'x'],
  ])('fails closed with %s %s', (flag, value) => {
    expect(run('audit-main.json', [flag, value]).status).toBe(1);
  });
  it('allows the expiry date', () => {
    expect(run('audit-main.json', ['--today', '2026-12-01']).status).toBe(0);
  });
  it('rejects invalid JSON', () => {
    writeFileSync(join(root, 'bad.json'), '{');
    expect(run('audit-main.json', ['--audit-file', join(root, 'bad.json')]).status).toBe(1);
  });
  it('blocks critical elsewhere and accepts moderate only', () => {
    const input = JSON.parse(readFileSync('scripts/ci/fixtures/audit-second-advisory.json', 'utf8'));
    input.vulnerabilities['other-package'].severity = 'critical';
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
    expect(evaluateAudit(report(false, 'moderate'), [], today).exitCode).toBe(0);
  });
});

describe('main registry lookups', () => {
  it.each(['"4.0.7"', '"4.0.8"', '"garbage"', '{}', 'not JSON', 'failed'])('handles registry output %s', output => {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const log = join(root, 'npm-calls.jsonl');
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args[0] === 'audit') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(resolve('scripts/ci/fixtures/audit-main.json'))}, 'utf8'));
  process.exitCode = 1;
} else {
  process.stdout.write(${JSON.stringify(output)});
  process.exitCode = ${output === 'failed' ? 1 : 0};
}
`, {mode: 0o755});
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ci/npm-audit.ts', '--root', root, '--today', today], {
      encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    expect(result.status).toBe(output === '"4.0.7"' ? 0 : 1);
    if (!['"4.0.7"', '"4.0.8"'].includes(output)) {
      expect(result.stderr).toContain('could not determine the latest picomatch version');
    }
    expect(readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual([
      ['audit', '--omit=dev', '--json'], ['view', 'picomatch', 'version', '--json'],
    ]);
  });
  it('does not query the registry in offline mode when latest is missing', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ci/npm-audit.ts', '--audit-file', 'scripts/ci/fixtures/audit-main.json', '--root', root, '--today', today], {encoding: 'utf8'});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not determine the latest picomatch version');
  });
});
