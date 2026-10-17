import {Client} from 'pg';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {researchConfig,preflightConfig} from './config';
const owner='10000000-0000-4000-8000-000000000001';
const local={ALPHA_S4_ENABLED:'1',ALPHA_S4_DATABASE_URL:'postgres://app:synthetic@127.0.0.1:5432/local'};
const production={...local,ALPHA_RESEARCH_RUNTIME_MODE:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),ALPHA_S4_RELEASE_SHA:'a'.repeat(40),ALPHA_S4_ORIGIN:'https://alpha.example.test',ALPHA_S4_DATABASE_URL:'postgres://research_app:synthetic@db.example.test:6543/research',ALPHA_S4_DB_HOST:'db.example.test',ALPHA_S4_DB_PORT:'6543',ALPHA_S4_DB_NAME:'research',ALPHA_S4_DB_ROLE:'research_app',ALPHA_S4_OWNER_IDS:owner};
describe('explicit research runtime configuration',()=>{
 it('preserves isolated local defaults with explicit connection fields',()=>{
  const c=researchConfig(local);expect(c.mode).toBe('local');expect(c.db.host).toBe('127.0.0.1');expect(c.db.ssl).toBe(false);expect(c.db.connectionString).toBeUndefined();
 });
 it('requires an explicit production environment and pins its exact target',()=>{
  const c=researchConfig(production);expect(c.mode).toBe('production');expect(c.db.max).toBe(2);expect(c.db.ssl).toMatchObject({rejectUnauthorized:true,servername:'db.example.test'});expect(c.owners).toEqual([owner]);
  expect(c.db.connectionString).toBeUndefined();
 });
 it.each([
  {ALPHA_S4_ENABLED:'0'}, {ALPHA_RESEARCH_RUNTIME_MODE:'prod'}, {VERCEL:'1'},
  {ALPHA_S4_DATABASE_URL:'https://app:secret@127.0.0.1/local'},
  {ALPHA_S4_DATABASE_URL:'postgres://app:secret@remote.example.test/local'},
  {ALPHA_S4_DATABASE_URL:'postgres://app:secret@127.0.0.1/local?host=remote.example.test'},
 ])('rejects unsafe local configuration %j',overrides=>expect(()=>researchConfig({...local,...overrides})).toThrow());
 it.each([
  {VERCEL_ENV:'preview'},{VERCEL:'0'},{ALPHA_S4_LOCAL_AUTH:'0'},{ALPHA_S4_LOCAL_SESSION_SECRET:'synthetic'},
  {ALPHA_S4_DB_HOST:'another.example.test'},{ALPHA_S4_DB_PORT:'5432'},{ALPHA_S4_DB_NAME:'other'},{ALPHA_S4_DB_ROLE:'other'},
  {ALPHA_S4_OWNER_IDS:''},{ALPHA_S4_RELEASE_SHA:'b'.repeat(40)},{ALPHA_S4_ORIGIN:'http://alpha.example.test'},
  {ALPHA_S4_DATABASE_URL:'postgres://research_app:secret@db.example.test:6543/research?sslmode=disable'},
 ])('rejects unsafe production configuration %j',overrides=>expect(()=>researchConfig({...production,...overrides})).toThrow());
 it('does not expose credentials or claim production readiness from configuration alone',()=>{
  const r=preflightConfig(production);expect(r.readyForProduction).toBe(false);expect(r.checks.configuration).toBe('passed');expect(JSON.stringify(r)).not.toContain('synthetic');expect(JSON.stringify(r)).not.toContain('postgres://');
  expect(preflightConfig({...production,ALPHA_S4_DATABASE_URL:'secret invalid'}).checks.configuration).toBe('failed');
 });
});

import {s4Pool,closeS4Pool} from '../s4/db';
afterEach(async()=>{await closeS4Pool();vi.unstubAllEnvs();});
it('runtime does not connect production even with valid candidate configuration',()=>{
 for(const [k,v] of Object.entries(production))vi.stubEnv(k,v);
 expect(()=>s4Pool()).toThrow('not_configured');
});
it('a cached pool cannot silently survive a changed connection target',()=>{
 for(const [k,v] of Object.entries(local))vi.stubEnv(k,v);
 const first=s4Pool();expect(s4Pool()).toBe(first);
 vi.stubEnv('ALPHA_S4_DATABASE_URL','postgres://app:synthetic@127.0.0.1:5433/local');
 expect(()=>s4Pool()).toThrow('not_configured');
});

it('pins the effective startup options despite PGOPTIONS',()=>{
 vi.stubEnv('PGOPTIONS','-c search_path=public,pg_catalog');
 const client=new Client(researchConfig(local).db);
 expect((client as unknown as {connectionParameters:{options:string}}).connectionParameters.options).toBe('-c search_path=pg_catalog,public');
});
