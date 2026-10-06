import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criticalSuites, migrationInventory, recoveredMigration, verifyDatabaseReport, verifyCriticalSuiteInventory } from '../../../scripts/ci/research-checks';

const report = () => ({ success: true, testResults: criticalSuites.map(p => ({ name: join(process.cwd(), p), assertionResults: [{ status: 'passed' }] })) });
describe('research database CI cannot silently skip', () => {
  it('requires all state-gated suites to be registered', () => expect(() => verifyCriticalSuiteInventory()).not.toThrow());
  it('requires every critical suite, not just a green aggregate', () => {
    const r = report(); r.testResults.pop();
    expect(() => verifyDatabaseReport(r)).toThrow('missing/empty');
  });
  it('rejects skipped or empty critical suites', () => {
    const r = report(); r.testResults[0].assertionResults[0].status = 'pending';
    expect(() => verifyDatabaseReport(r)).toThrow('failed/skipped');
    r.testResults[0].assertionResults = [];
    expect(() => verifyDatabaseReport(r)).toThrow('missing/empty');
  });
  it('accepts executed critical tests', () => expect(verifyDatabaseReport(report()).criticalPassed).toBe(criticalSuites.length));
  it('pins the recovered historical SQL and rejects deletion/duplicate versions/tampering', () => {
    expect(migrationInventory().some(m => m.file === recoveredMigration.file)).toBe(true);
    const root = mkdtempSync(join(tmpdir(), 'alpha-migration-contract-'));
    const directory = join(root, 'supabase/migrations'); mkdirSync(directory, { recursive: true });
    try {
      expect(() => migrationInventory(root)).toThrow('missing');
      cpSync('supabase/migrations', directory, { recursive: true });
      copyFileSync('supabase/migrations.lock.json', join(root, 'supabase/migrations.lock.json'));
      writeFileSync(join(directory, '20260904090000_duplicate.sql'), '-- duplicate');
      expect(() => migrationInventory(root)).toThrow('duplicate');
      rmSync(join(directory, '20260904090000_duplicate.sql'));
      const locked = '20260515000000_initial_schema.sql';
      writeFileSync(join(directory, locked), '-- tampered historical file');
      expect(() => migrationInventory(root)).toThrow('Locked migration');
      copyFileSync(join('supabase/migrations', locked), join(directory, locked));
      writeFileSync(join(directory, '20000101000000_backfill.sql'), '-- unapproved history insertion');
      expect(() => migrationInventory(root)).toThrow('Non-append migration');
      rmSync(join(directory, '20000101000000_backfill.sql'));
      writeFileSync(join(directory, recoveredMigration.file), '-- tampered');
      expect(() => migrationInventory(root)).toThrow('bytes changed');
    } finally { rmSync(root, { recursive: true }); }
  });
});
