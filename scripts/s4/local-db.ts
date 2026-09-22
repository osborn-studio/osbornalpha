/** Real isolated PostgreSQL for local acceptance. Never reads developer .env files. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { Pool } from 'pg';

export async function startLocalDatabase() {
  const bin = process.env.S4_POSTGRES_BIN || '/opt/homebrew/opt/postgresql@17/bin';
  const directory = mkdtempSync(join(tmpdir(),'alpha-s4-db-'));
  const password = randomBytes(24).toString('hex'), appPassword = randomBytes(24).toString('hex');
  const passwordFile = join(directory,'password'); writeFileSync(passwordFile,password,{ mode:0o600 });
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = (server.address() as { port:number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  execFileSync(join(bin,'initdb'),['-D',join(directory,'data'),'-U','s4_admin','--auth-host=scram-sha-256','--auth-local=trust','--pwfile='+passwordFile],{ stdio:'pipe' });
  writeFileSync(join(directory,'data','postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories='${directory}'\n`);
  execFileSync(join(bin,'pg_ctl'),['-D',join(directory,'data'),'-l',join(directory,'postgres.log'),'-w','start'],{ stdio:'pipe' });
  const adminUrl = `postgres://s4_admin:${password}@127.0.0.1:${port}/postgres`;
  const runtimeUrl = `postgres://s4_app:${appPassword}@127.0.0.1:${port}/postgres`;
  const admin = new Pool({ connectionString:adminUrl });
  try {
    await admin.query(`create role postgres nologin superuser; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const migrations = readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort();
    for (const file of migrations) {
      try { await admin.query(readFileSync(join('supabase/migrations',file),'utf8')); }
      catch (e) { throw new Error(`Migration ${file}: ${(e as Error).message}`); }
    }
    await admin.query(`create role s4_app login password '${appPassword}' nosuperuser nobypassrls; grant alpha_s4_runtime to s4_app;`);
    const state = { directory, bin, adminUrl, runtimeUrl, migrations };
    const stateFile = join(directory,'state.json'); writeFileSync(stateFile,JSON.stringify(state),{ mode:0o600 });
    return { ...state, stateFile };
  } catch(e) {
    execFileSync(join(bin,'pg_ctl'),['-D',join(directory,'data'),'-m','fast','-w','stop'],{ stdio:'pipe' });
    throw e;
  } finally { await admin.end(); }
}
if (process.argv[1]?.endsWith('/local-db.ts')) {
  startLocalDatabase().then(s => console.log(JSON.stringify({directory:s.directory,stateFile:s.stateFile,migrations:s.migrations.length}))).catch(e => { console.error(e.message); process.exitCode=1; });
}
