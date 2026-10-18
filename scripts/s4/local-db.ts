/** Real isolated PostgreSQL for local acceptance. Never reads developer .env files. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { Pool, type PoolConfig } from 'pg';

/** pg-pool re-emits an idle client's error on the pool, and Node throws when nothing listens.
 * pool.end() resolves before the server has processed each Terminate, so a cluster stopped
 * synchronously right afterwards can still deliver FATAL 57P01 to a half-closed client.
 * Report only the SQLSTATE: no message, host or credentials reach the log. */
export function ownedPool(config: PoolConfig): Pool {
  const pool = new Pool(config);
  pool.on('error', error => { console.error('owned pool idle client error', { code: (error as { code?: string }).code ?? 'unknown' }); });
  return pool;
}

export function stopLocalDatabase(state: { bin: string; directory: string }, primaryError?: unknown, retainDirectory = false) {
  const data = join(state.directory, 'data');
  try {
    if (existsSync(join(data, 'postmaster.pid'))) {
      try {
        execFileSync(join(state.bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe', timeout: 30_000 });
      } catch (fastError) {
        if (existsSync(join(data, 'postmaster.pid'))) {
          try { execFileSync(join(state.bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe', timeout: 30_000 }); }
          catch (immediateError) { throw new AggregateError([fastError, immediateError], 'Could not confirm local cluster stopped'); }
        }
      }
    }
    if (existsSync(join(data, 'postmaster.pid'))) throw new Error('Postmaster pid remains; retaining directory');
    if (!retainDirectory) rmSync(state.directory, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new AggregateError(primaryError ? [primaryError, cleanupError] : [cleanupError],
      `${primaryError instanceof Error ? primaryError.message + '; ' : ''}Local cleanup failed; retained ${state.directory}`);
  }
}

export async function startLocalDatabase(options: { rehearsalDefaultTableGrants?: boolean; beforeMigration?: (admin: Pool, file: string) => Promise<void> } = {}) {
  if (process.env.S4_TEST_STATE || Object.keys(process.env).some(k => /^(PG|SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|ALPHA_S4_DATABASE_URL$)/.test(k))) {
    throw new Error('Refusing inherited database configuration; run in a clean test environment');
  }
  if (readdirSync('.').some(f => f === '.env' || (f.startsWith('.env.') && f !== '.env.example'))) throw new Error('Test checkout must not contain .env files');
  const bin = process.env.S4_POSTGRES_BIN || (process.platform === 'darwin' ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
  if (!existsSync(join(bin, 'initdb'))) throw new Error('Set S4_POSTGRES_BIN to installed PostgreSQL 17 binaries');
  const postgresVersion = execFileSync(join(bin, 'postgres'), ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  if (!/PostgreSQL\) 17\./.test(postgresVersion)) throw new Error('PostgreSQL 17 required for this harness');
  const directory = mkdtempSync(join(tmpdir(),'alpha-s4-db-'));
  const password = randomBytes(24).toString('hex'), appPassword = randomBytes(24).toString('hex');
  const passwordFile = join(directory,'password'); writeFileSync(passwordFile,password,{ mode:0o600 });
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = (server.address() as { port:number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  let admin: Pool | undefined;
  let started = false;
  try {
  execFileSync(join(bin,'initdb'),['-D',join(directory,'data'),'-U','s4_admin','--auth-host=scram-sha-256','--auth-local=trust','--pwfile='+passwordFile],{ stdio:'pipe', timeout: 30_000 });
  writeFileSync(join(directory,'data','postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories='${directory}'\n`);
  execFileSync(join(bin,'pg_ctl'),['-D',join(directory,'data'),'-l',join(directory,'postgres.log'),'-w','start'],{ stdio:'pipe', timeout: 30_000 });
  const adminUrl = `postgres://s4_admin:${password}@127.0.0.1:${port}/postgres`;
  const runtimeUrl = `postgres://s4_app:${appPassword}@127.0.0.1:${port}/postgres`;
  started = true;
  admin = ownedPool({ connectionString:adminUrl, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
    await admin.query(`create role postgres nologin superuser; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    if (options.rehearsalDefaultTableGrants) {
      await admin.query('grant usage on schema public to anon, authenticated, service_role; alter default privileges for role s4_admin in schema public grant all on tables to anon, authenticated, service_role;');
    }
    const migrations = readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort();
    for (const file of migrations) {
      try {
        await options.beforeMigration?.(admin, file);
        await admin.query(readFileSync(join('supabase/migrations',file),'utf8'));
      }
      catch (e) { throw new Error(`Migration ${file}: ${(e as Error).message}`); }
    }
    await admin.query(`create role s4_app login password '${appPassword}' nosuperuser nobypassrls; grant alpha_s4_runtime to s4_app;`);
    const state = { directory, bin, adminUrl, runtimeUrl, migrations, postgresVersion };
    const stateFile = join(directory,'state.json'); writeFileSync(stateFile,JSON.stringify(state),{ mode:0o600 });
    return { ...state, stateFile };
  } catch(e) {
    if (admin) { await admin.end(); admin = undefined; }
    // A timed-out pg_ctl start may still have started our own cluster.
    if (started || existsSync(join(directory, 'data', 'postmaster.pid'))) stopLocalDatabase({ bin, directory }, e);
    else rmSync(directory, { recursive: true });
    throw e;
  } finally { await admin?.end(); }
}
if (process.argv[1]?.endsWith('/local-db.ts')) {
  startLocalDatabase().then(s => console.log(JSON.stringify({directory:s.directory,stateFile:s.stateFile,migrations:s.migrations.length}))).catch(e => { console.error(e.message); process.exitCode=1; });
}
