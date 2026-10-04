/** One bounded full test run, with a fresh loopback database and a fail-closed report gate. */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startLocalDatabase, stopLocalDatabase } from '../s4/local-db';
import { migrationInventory, verifyDatabaseReport, verifyCriticalSuiteInventory } from './research-checks';

async function main() {
  const manifest = migrationInventory();
  verifyCriticalSuiteInventory();
  mkdirSync('reports', { recursive: true });
  rmSync('reports/research-db-summary.json', { force: true });
  let summary: Record<string, unknown> | undefined;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const output = mkdtempSync(join(tmpdir(), 'alpha-db-report-'));
  let primaryError: unknown;
  let database: Awaited<ReturnType<typeof startLocalDatabase>> | undefined;
  try {
    database = await startLocalDatabase();
    abort.signal.throwIfAborted();
    const report = join(output, 'vitest.json');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`], {
        stdio: 'inherit', signal: abort.signal, env: { ...process.env, S4_TEST_STATE: database!.stateFile },
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Vitest exit ${code}`)));
    });
    const results = JSON.parse(readFileSync(report, 'utf8'));
    summary = { ...verifyDatabaseReport(results), totalPassed: results.numPassedTests, migrations: manifest, testedAt: new Date().toISOString(), postgresVersion: database.postgresVersion, scope: 'isolated PostgreSQL; not Supabase production equivalence' };
  } catch (e) { primaryError = e; throw e; } finally {
    try { if (database) stopLocalDatabase(database, primaryError); }
    finally {
      rmSync(output, { recursive: true, force: true });
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    }
  }
  writeFileSync('reports/research-db-summary.json', JSON.stringify({ ...summary, cleanup: 'stopped' }, null, 2));
  console.log(JSON.stringify({ ...summary, migrations: manifest.length, cleanup: 'stopped' }));
}
main().catch(e => { console.error((e as Error).message); process.exitCode = 1; });
