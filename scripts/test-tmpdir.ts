// ALPHA_TEST_TMP_ROOT selects an existing directory for test runs. Set it to '' to disable.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const defaultRoot = '/Volumes/AIMATE_WORK/tmp';
const parentName = 'osbornalpha-test';
const runName = /^(\d+)-[0-9a-f]{4}$/;

function hasPostmaster(dir: string) {
  return readdirSync(dir).some(name => statSync(join(dir, name, 'data', 'postmaster.pid'), { throwIfNoEntry: false }));
}

function sweepStale(parent: string) {
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    const match = runName.exec(entry.name);
    if (!entry.isDirectory() || !match) continue;
    try {
      process.kill(Number(match[1]), 0);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue;
    }
    const dir = join(parent, entry.name);
    try {
      if (!hasPostmaster(dir)) rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function createRunDirectory(root: string) {
  const parent = resolve(root, parentName);
  for (;;) {
    mkdirSync(parent, { recursive: true });
    // PostgreSQL puts its Unix socket under TMPDIR, so keep the run name at most 12 characters.
    const dir = join(parent, `${process.pid}-${randomBytes(2).toString('hex')}`);
    try {
      mkdirSync(dir, { mode: 0o700 });
      return dir;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Retry a name collision or a concurrent run removing the newly empty parent.
      if (code !== 'EEXIST' && code !== 'ENOENT') throw error;
    }
  }
}

export function makeTestTmpdir(env: Record<string, string | undefined>, onExit: (cleanup: () => void) => void) {
  let owned: string | undefined;
  return (): string | undefined => {
    if (owned) return owned;
    const root = env.ALPHA_TEST_TMP_ROOT ?? defaultRoot;
    if (env.TMPDIR) {
      const tmp = env.TMPDIR.replace(/\/+$/, '').replace(/^\/private(?=\/)/, '');
      if (!/^\/(?:var\/folders|var\/tmp|tmp)(?:\/|$)/.test(tmp)) return;
      // An override root can itself be under /tmp. Its workers must inherit the run.
      if (basename(dirname(tmp)) === parentName && runName.test(basename(tmp))) return;
    }
    if (!root || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) return;

    const dir = createRunDirectory(root);
    const creatorPid = process.pid;
    onExit(() => {
      if (process.pid !== creatorPid) return;
      try {
        if (hasPostmaster(dir)) {
          console.error(`Retained test directory containing postmaster.pid: ${dir}`);
          return;
        }
        rmSync(dir, { recursive: true, force: true });
        rmdirSync(dirname(dir));
      } catch { /* Exit cleanup is best effort. Keep the run if inspection fails. */ }
    });
    sweepStale(dirname(dir));
    env.TMPDIR = dir;
    owned = dir;
    return dir;
  };
}

export const configureTestTmpdir = makeTestTmpdir(process.env, cleanup => process.once('exit', cleanup));
