import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureTestTmpdir, makeTestTmpdir } from '../test-tmpdir';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'test-tmpdir-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

it.each(['absent', 'file', 'disabled', 'custom'] as const)('leaves the environment alone for %s', scenario => {
  const file = join(root, 'file');
  writeFileSync(file, '');
  const roots = { absent: join(root, 'missing'), file, disabled: '', custom: root };
  const env = { ALPHA_TEST_TMP_ROOT: roots[scenario], TMPDIR: scenario === 'custom' ? '/tmp-custom' : '' };
  const original = { ...env };
  const register = vi.fn();
  expect(makeTestTmpdir(env, register)()).toBeUndefined();
  expect(env).toEqual(original);
  expect(register).not.toHaveBeenCalled();
  expect(existsSync(join(root, 'osbornalpha-test'))).toBe(false);
});

it.each(['/var/folders/x/T/', '/private/var/folders/x/T', '/tmp', '/private/var/tmp/', '', undefined])(
  'owns one private run directory for system TMPDIR %s', TMPDIR => {
    const env = { ALPHA_TEST_TMP_ROOT: root, TMPDIR };
    const register = vi.fn<(cleanup: () => void) => void>();
    const use = makeTestTmpdir(env, register);
    const dir = use()!;
    expect(dirname(dir)).toBe(join(root, 'osbornalpha-test'));
    expect(basename(dir)).toMatch(new RegExp(`^${process.pid}-[0-9a-f]{4}$`));
    expect(basename(dir).length).toBeLessThanOrEqual(12);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(env.TMPDIR).toBe(dir);
    expect(use()).toBe(dir);
    expect(register).toHaveBeenCalledTimes(1);
    const childRegister = vi.fn();
    expect(makeTestTmpdir({ ...env }, childRegister)()).toBeUndefined();
    expect(childRegister).not.toHaveBeenCalled();
    register.mock.calls[0][0]();
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(dirname(dir))).toBe(false);
  },
);

it('leaves the process environment alone when disabled', () => {
  vi.stubEnv('ALPHA_TEST_TMP_ROOT', '');
  const tmp = process.env.TMPDIR;
  try {
    expect(configureTestTmpdir()).toBeUndefined();
    expect(process.env.TMPDIR).toBe(tmp);
  } finally { vi.unstubAllEnvs(); }
});

it('allows exit cleanup after the run directory was already removed', () => {
  const register = vi.fn<(cleanup: () => void) => void>();
  const dir = makeTestTmpdir({ ALPHA_TEST_TMP_ROOT: root }, register)()!;
  rmSync(dir, { recursive: true });
  expect(register.mock.calls[0][0]).not.toThrow();
});

function markCluster(dir: string) {
  const data = join(dir, 'x', 'data');
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, 'postmaster.pid'), '123');
}

it('reports and retains a run containing a PostgreSQL pid file', () => {
  const register = vi.fn<(cleanup: () => void) => void>();
  const dir = makeTestTmpdir({ ALPHA_TEST_TMP_ROOT: root }, register)()!;
  markCluster(dir);
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    register.mock.calls[0][0]();
    expect(stderr).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(dir));
    expect(existsSync(join(dir, 'x/data/postmaster.pid'))).toBe(true);
  } finally { stderr.mockRestore(); }
});

it('sweeps only dead owners without a PostgreSQL pid file', () => {
  const child = spawnSync(process.execPath, ['-e', '']);
  expect(child.status).toBe(0);
  const parent = join(root, 'osbornalpha-test');
  const dead = join(parent, `${child.pid}-0000`);
  const retained = join(parent, `${child.pid}-abcd`);
  const live = join(parent, `${process.pid}-0000`);
  const unrelated = join(parent, 'unrelated');
  for (const dir of [dead, live, unrelated]) mkdirSync(dir, { recursive: true });
  markCluster(retained);
  makeTestTmpdir({ ALPHA_TEST_TMP_ROOT: root }, vi.fn())();
  expect(existsSync(dead)).toBe(false);
  for (const dir of [retained, live, unrelated]) expect(existsSync(dir)).toBe(true);
});
