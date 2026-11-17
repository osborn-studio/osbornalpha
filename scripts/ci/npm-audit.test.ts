import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {evaluateAudit as evaluate, type AuditReport} from './npm-audit';

const id = 'GHSA-fc5q-39xc-vjpf';
const today = '2026-11-17';
const allowlist = [{id, package: 'picomatch', installed: '4.0.7', reason: 'No patched version', expires: '2026-12-31'}];
function report(fixAvailable: boolean | {name: string; version: string}, severity = 'high'): AuditReport {
  return {vulnerabilities: {picomatch: {severity, fixAvailable, nodes: ['node_modules/picomatch'], via: [{url: `https://github.com/advisories/${id}`}]}}};
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
  install('node_modules/picomatch', '4.0.7');
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
    install('node_modules/picomatch', '4.0.8');
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
    expect(evaluateAudit(input, allowlist, today).exitCode).toBe(0);
  });
  it('allows a transitive row carrying the same advisory id', () => {
    const input = report(true);
    input.vulnerabilities['@parcel/watcher'] = {
      severity: 'high', fixAvailable: true, via: [{url: `https://github.com/advisories/${id}`}],
    };
    const result = evaluateAudit(input, allowlist, today);
    expect(result.exitCode).toBe(0);
    expect(result.findings.every(row => row.status.startsWith('allowlisted('))).toBe(true);
    install('node_modules/picomatch', '4.0.8');
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
});
