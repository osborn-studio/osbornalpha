import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {evaluateAudit as evaluate, main, type AuditReport} from './npm-audit';

const id = 'GHSA-fc5q-39xc-vjpf';
vi.mock('node:child_process', () => ({spawnSync: vi.fn()}));
const leafPath = 'node_modules/@parcel/watcher/node_modules/picomatch';
const today = '2026-11-17';
const allowlist = [{id, package: 'picomatch', path: leafPath, installed: '4.0.7', reason: 'No patched version', expires: '2026-12-31'}];
function report(fixAvailable: boolean | {name: string; version: string}, severity = 'high'): AuditReport {
  return {vulnerabilities: {picomatch: {severity, fixAvailable, nodes: [leafPath], via: [{url: `https://github.com/advisories/${id}`}]}}};
}

let root: string;
function install(node: string, version: string) {
  mkdirSync(join(root, node), {recursive: true});
  writeFileSync(join(root, node, 'package.json'), JSON.stringify({version}));
}
function evaluateAudit(input: AuditReport, entries: typeof allowlist, date: string) {
  return evaluate(input, entries, date, root);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'npm-audit-test-'));
  install(leafPath, '4.0.7');
});
afterEach(() => rmSync(root, {recursive: true, force: true}));

describe('evaluateAudit', () => {
  it('blocks high findings with fixes', () => {
    expect(evaluateAudit(report(true), [], today).findings[0].status).toBe('blocking');
  });
  it.each([false, true, {name: 'picomatch', version: '4.0.7'}])('allows a matching installed version regardless of npm fix metadata: %j', fix => {
    const result = evaluateAudit(report(fix), allowlist, today);
    expect(result.findings[0].status).toBe('allowlisted(No patched version, 2026-12-31)');
    expect(result.exitCode).toBe(0);
  });
  it('blocks entries on their expiry date', () => {
    const result = evaluateAudit(report(false), allowlist, '2026-12-31');
    expect(result.findings[0].status).toBe('blocking');
    expect(result.exitCode).toBe(1);
  });
  it('blocks when an installed version differs', () => {
    install(leafPath, '4.0.8');
    const result = evaluateAudit(report(true), allowlist, today);
    expect(result.findings[0].status).toBe('blocking');
    expect(result.exitCode).toBe(1);
    expect(result.messages.join('\n')).toContain('installed 4.0.8 differs from allowlisted 4.0.7; re-check the advisory and update or remove the entry');
  });
  it('checks every installed node, including nested copies', () => {
    const input = report(true);
    input.vulnerabilities.picomatch.nodes!.push('node_modules/other/node_modules/picomatch');
    install('node_modules/other/node_modules/picomatch', '4.0.6');
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(1);
    install('node_modules/other/node_modules/picomatch', '4.0.7');
    const result = evaluateAudit(input, allowlist, today);
    expect(result.exitCode).toBe(1);
    expect(result.findings[0].status).toBe('blocking');
    expect(result.messages.join('\n')).toContain('node_modules/other/node_modules/picomatch');
    expect(evaluateAudit(input, [...allowlist, {...allowlist[0], path: 'node_modules/other/node_modules/picomatch'}], today).exitCode).toBe(0);
  });
  it('allows a transitive row carrying the same advisory id', () => {
    const input = report(true);
    input.vulnerabilities['@parcel/watcher'] = {
      severity: 'high', fixAvailable: true, nodes: ['node_modules/@parcel/watcher'], via: ['picomatch'],
    };
    const result = evaluateAudit(input, allowlist, today);
    expect(result.exitCode).toBe(0);
    expect(result.findings.every(row => row.status.startsWith('allowlisted('))).toBe(true);
    install(leafPath, '4.0.8');
    expect(evaluateAudit(input, allowlist, today).findings.every(row => row.status === 'blocking')).toBe(true);
  });
  it('covers an ID-only parent only through the approved leaf path', () => {
    const input = report(false);
    input.vulnerabilities['@parcel/watcher'] = {
      severity: 'high', nodes: ['node_modules/@parcel/watcher'], via: [{url: `https://github.com/advisories/${id}`}],
    };
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(0);
    input.vulnerabilities['@parcel/watcher'].nodes = ['node_modules/other'];
    const result = evaluateAudit(input, allowlist, today);
    expect(result.findings[1].status).toBe('blocking');
    expect(result.messages.join('\n')).toContain('node_modules/other');
  });
  it('blocks the same advisory when only an unexpected leaf path is present', () => {
    const input = report(false);
    input.vulnerabilities.picomatch.nodes = ['node_modules/picomatch'];
    install('node_modules/picomatch', '4.0.7');
    const result = evaluateAudit(input, allowlist, today);
    expect(result.exitCode).toBe(1);
    expect(result.findings[0].status).toBe('blocking');
    expect(result.messages.join('\n')).toContain('unexpected or unapproved path node_modules/picomatch');
  });
  it('keeps moderate findings below threshold', () => {
    const result = evaluateAudit(report(true, 'moderate'), [], today);
    expect(result.findings[0].status).toBe('below-threshold');
    expect(result.exitCode).toBe(0);
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
    expect(evaluateAudit(report(false), [{...allowlist[0], package: 'other', path: 'node_modules/other'}], today).exitCode).toBe(1);
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
});


describe('fail-closed validation', () => {
  it('fails when the allowlisted node package.json is missing', () => {
    rmSync(join(root, leafPath, 'package.json'));
    const result = evaluateAudit(report(false), allowlist, today);
    expect(result.exitCode).toBe(1);
    expect(result.messages.join('\n')).toContain(`cannot read installed version at ${leafPath}`);
  });
  it.each(['id', 'package', 'path', 'installed', 'reason', 'expires'])('rejects missing or invalid %s', field => {
    for (const value of [undefined, '', 42, {}, '   ']) {
      expect(() => evaluateAudit(report(false), [{...allowlist[0], [field]: value}], today)).toThrow('Invalid npm audit allowlist entry');
    }
  });
  it.each(['../picomatch', '/node_modules/picomatch', 'node_modules/../picomatch'])('rejects unsafe path %s', path => {
    expect(() => evaluateAudit(report(false), [{...allowlist[0], path}], today)).toThrow('Invalid npm audit allowlist entry');
  });
  it.each([
    {stdout: '{malformed', status: 1, signal: null},
    {stdout: '{}', status: 2, signal: null},
    {stdout: '', status: null, signal: null, error: new Error('spawn failed')},
  ])('exits 1 with a reason for audit execution or JSON failures: %j', audit => {
    const previousExitCode = process.exitCode;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(spawnSync).mockReturnValue(audit as ReturnType<typeof spawnSync>);
    try {
      main();
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/^Dependency audit failed: .+/));
    } finally {
      process.exitCode = previousExitCode;
      vi.restoreAllMocks();
    }
  });
});
