/**
 * Research OS SQLite layer (Phase 1, local-only).
 *
 * Production safety valve: stock-monitor auto-deploys to Vercel (no persistent
 * disk), so the entire Research OS is gated behind RESEARCH_OS_ENABLED=1 which
 * is only ever set in local .env.local. better-sqlite3 is loaded LAZILY inside
 * getDb() via a dynamic require — when the gate is off the native module is
 * never touched, so Vercel builds/runtime stay inert.
 */

import path from 'node:path';
import fs from 'node:fs';

// better-sqlite3's Database instance, typed loosely so the type import does not
// pull the native module into any bundle graph.
export interface ResearchDb {
  prepare(sql: string): any;
  exec(sql: string): void;
  pragma(sql: string, opts?: { simple?: boolean }): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

/** Thrown when Research OS is used without RESEARCH_OS_ENABLED=1 (API → 501). */
export class ResearchDisabled extends Error {
  constructor() {
    super('research os is local-only');
    this.name = 'ResearchDisabled';
  }
}

export function isResearchEnabled(): boolean {
  return process.env.RESEARCH_OS_ENABLED === '1';
}

/** Gate for every API route / server entry point. */
export function assertEnabled(): void {
  if (!isResearchEnabled()) throw new ResearchDisabled();
}

export const SCHEMA_VERSION = 2;

function schemaSql(): string {
  const p = path.join(process.cwd(), 'src', 'lib', 'research', 'schema.sql');
  return fs.readFileSync(p, 'utf8');
}

/**
 * Ordered migrations; PRAGMA user_version N means MIGRATIONS[0..N-1] applied.
 * MIGRATIONS[0] = full Phase 1 schema (v1), MIGRATIONS[1] = Phase 2 signal
 * columns (v2). Never edit a shipped migration — append a new one.
 */
export const MIGRATIONS: ReadonlyArray<(db: ResearchDb) => void> = [
  // v1: Phase 1 schema (schema.sql is frozen at v1; later versions are alters).
  (db) => db.exec(schemaSql()),
  // v2: signal extraction bookkeeping — unmatched entity names etc. (metadata)
  // and per-row LLM provenance {model, prompt_sha256, generated_at}.
  (db) => db.exec(
    `alter table signals add column metadata text not null default '{}';
     alter table signals add column llm_provenance text not null default '{}';`,
  ),
];

export function applyMigrations(db: ResearchDb): void {
  let version = db.pragma('user_version', { simple: true }) as number;
  while (version < MIGRATIONS.length) {
    MIGRATIONS[version](db);
    version += 1;
    db.pragma(`user_version = ${version}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
function loadBetterSqlite3(): any {
  // Indirect eval require so webpack/Next never statically resolves the native
  // module; it is only reachable at runtime on a local machine with the gate on.
  // eslint-disable-next-line no-eval
  const req = eval('require') as NodeRequire;
  return req('better-sqlite3');
}

let singleton: ResearchDb | null = null;
let singletonPath: string | null = null;

export function defaultDbPath(): string {
  return process.env.RESEARCH_DB_PATH ?? path.join('research-data', 'research.db');
}

/**
 * Lazy singleton. First connection enables WAL + foreign keys and runs any
 * pending MIGRATIONS (user_version 0 → SCHEMA_VERSION). Throws
 * ResearchDisabled when the gate is off.
 */
export function getDb(dbPath: string = defaultDbPath()): ResearchDb {
  assertEnabled();
  if (singleton && singletonPath === dbPath) return singleton;
  const Database = loadBetterSqlite3();
  const abs = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db: ResearchDb = new Database(abs);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  singleton = db;
  singletonPath = dbPath;
  return db;
}

/** In-memory database with full schema, for tests. Bypasses the env gate. */
export function openTestDb(): ResearchDb {
  const Database = loadBetterSqlite3();
  const db: ResearchDb = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

/** Append an audit_log row (compliance red line: ingest/generate/review all leave a trace). */
export function logAudit(
  db: ResearchDb,
  action: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
): void {
  db.prepare(
    `insert into audit_log (id, action, actor, target_id, detail, created_at)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    action,
    'local-user',
    targetId,
    JSON.stringify(detail),
    new Date().toISOString(),
  );
}
