import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const recoveredMigration = {
  file: '20260904090000_watchlist_decision_sync.sql',
  sha256: '31b96984bd7fb6b3a3db557618a830ee6cd77d45ee3186452eefe7b218019107',
};
export const criticalSuites = [
  's4/integration.test.ts', 's4/anchor-two-phase.integration.test.ts', 's4/anchor-runner.integration.test.ts', 's4/checkpoint-registry.integration.test.ts', 's4/anchor-runner-program.integration.test.ts', 's4/ledger.integration.test.ts', 's4/source-extension.integration.test.ts',
  's6/arm-lineage.integration.test.ts', 's6/store.integration.test.ts', 's6/arm-report-db.integration.test.ts',
  'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
  'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
  'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts', 'src/lib/dq/dq-extensions.integration.test.ts', 'src/lib/dq/reconcile/ixbrl-pair.integration.test.ts', 'src/lib/dq/reconcile/lineage.integration.test.ts', 'src/lib/facts/sync-cn.integration.test.ts', 'src/lib/dq/calendar.integration.test.ts')
 // F6 begin
 .concat('src/lib/evals/evals-store.integration.test.ts', 'src/lib/evals/evals-facts.integration.test.ts')
 // F6 end
;
// INDUSTRY:BEGIN — appended without touching the list above (parallel plans edit that line)
criticalSuites.push('src/lib/industry/industry.integration.test.ts', 'src/lib/industry/functions.integration.test.ts', 'src/lib/industry/sync.integration.test.ts');
// INDUSTRY:END
// MACRO
criticalSuites.push('src/lib/macro/macro.integration.test.ts');
// /MACRO
// MACRO-P3
criticalSuites.push('src/lib/macro/strategy/strategy.integration.test.ts');
// /MACRO-P3
// F3 document pipeline (Tasks 1, 13, 18)
criticalSuites.push('src/lib/documents/documents.integration.test.ts', 'src/lib/documents/fact-citations.integration.test.ts',
   'src/lib/documents/sync-hk.integration.test.ts', 'src/lib/documents/sync-us.integration.test.ts');
// end F3
// COMPANY
criticalSuites.push('src/lib/company/company-research.integration.test.ts', 'src/lib/company/documents-bridge.integration.test.ts');
// /COMPANY

export function migrationInventory(root = process.cwd()) {
  const directory = join(root, 'supabase/migrations');
  const files = readdirSync(directory).filter(f => f.endsWith('.sql')).sort();
  const versions = new Set<string>();
  for (const file of files) {
    const version = /^(\d{14})_.+\.sql$/.exec(file)?.[1];
    if (!version || versions.has(version)) throw new Error(`Invalid/duplicate migration version: ${file}`);
    versions.add(version);
  }
  if (!files.includes(recoveredMigration.file)) throw new Error('Recovered migration missing');
  if (createHash('sha256').update(readFileSync(join(directory, recoveredMigration.file))).digest('hex') !== recoveredMigration.sha256) {
    throw new Error('Recovered migration bytes changed');
  }
  const lock = JSON.parse(readFileSync(join(root, 'supabase/migrations.lock.json'), 'utf8')) as { migrations: { file: string; sha256: string }[] };
  const maxLocked = lock.migrations.map(m => m.file.slice(0, 14)).sort().at(-1);
  if (!maxLocked) throw new Error('Migration lock is empty');
  for (const entry of lock.migrations) {
    if (!files.includes(entry.file) || createHash('sha256').update(readFileSync(join(directory, entry.file))).digest('hex') !== entry.sha256) throw new Error(`Locked migration changed/missing: ${entry.file}`);
  }
  for (const file of files) {
    if (!lock.migrations.some(m => m.file === file) && file.slice(0, 14) <= maxLocked) throw new Error(`Non-append migration: ${file}`);
  }
  return files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(directory, file))).digest('hex') }));
}

type Report = { success?: boolean; testResults?: { name: string; assertionResults: { status: string }[] }[] };
export function verifyDatabaseReport(report: Report, root = process.cwd()) {
  if (report.success !== true) throw new Error('Vitest did not succeed');
  let passed = 0;
  for (const file of criticalSuites) {
    const results = report.testResults?.filter(t => t.name === join(root, file));
    if (results?.length !== 1 || !results[0].assertionResults.length) throw new Error(`Critical suite missing/empty: ${file}`);
    if (results[0].assertionResults.some(t => t.status !== 'passed')) throw new Error(`Critical suite failed/skipped: ${file}`);
    passed += results[0].assertionResults.length;
  }
  return { criticalSuites: criticalSuites.length, criticalPassed: passed, criticalSkipped: 0 };
}

export function verifyCriticalSuiteInventory(root = process.cwd()) {
  const source = join(root, 'src');
  const discovered = readdirSync(source, { recursive: true }).filter((p): p is string => typeof p === 'string' && p.endsWith('.test.ts'))
    .filter(p => readFileSync(join(source, p), 'utf8').includes('S4_TEST_STATE'))
    .map(p => 'src/' + p.replaceAll('\\', '/')).sort();
  if (JSON.stringify(discovered) !== JSON.stringify([...criticalSuites].sort())) throw new Error('Database suite inventory drift');
}
