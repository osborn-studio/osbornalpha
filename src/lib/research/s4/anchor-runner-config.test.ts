import {describe,expect,it} from 'vitest';
import {anchorRunnerConfig} from './anchor-runner-config';

const owner='10000000-0000-4000-8000-000000000001',principal='10000000-0000-4000-8000-000000000002';
const env={
 ALPHA_ANCHOR_MANIFEST:'/etc/alpha-anchor/manifest.json',ALPHA_ANCHOR_RECEIPT_ROOT:'/var/lib/alpha-anchor/store',ALPHA_ANCHOR_PRINCIPAL_ID:principal,ALPHA_ANCHOR_OWNERS:owner,
 ALPHA_ANCHOR_DB_HOST:'db.example.test',ALPHA_ANCHOR_DB_PORT:'6543',ALPHA_ANCHOR_DB_DATABASE:'research',ALPHA_ANCHOR_DB_USER:'alpha_anchor_app',ALPHA_ANCHOR_DB_PASSWORD:'synthetic-db-secret',
 ALPHA_ANCHOR_REGISTRY_HOST:'registry.example.test',ALPHA_ANCHOR_REGISTRY_PORT:'5432',ALPHA_ANCHOR_REGISTRY_DATABASE:'alpha_anchor_checkpoint',ALPHA_ANCHOR_REGISTRY_USER:'alpha_checkpoint_app',ALPHA_ANCHOR_REGISTRY_PASSWORD:'synthetic-registry-secret',
};
describe('anchor runner configuration',()=>{
 it('parses explicit fields, verifies TLS by host name and keeps both secrets out of serialized output',()=>{
  const c=anchorRunnerConfig(env);
  expect(c).toMatchObject({manifestPath:env.ALPHA_ANCHOR_MANIFEST,receiptRoot:env.ALPHA_ANCHOR_RECEIPT_ROOT,principalId:principal,owners:[owner],intervalSeconds:60,watchdogMs:5000});
  expect(c.db).toMatchObject({host:'db.example.test',port:6543,database:'research',user:'alpha_anchor_app',max:2,application_name:'alpha-anchor-runner'});
  expect(c.db.ssl).toMatchObject({rejectUnauthorized:true,servername:'db.example.test'});
  expect(c.registry.db).toMatchObject({host:'registry.example.test'});
  const serialized=JSON.stringify(c);
  expect(serialized).not.toContain('synthetic-db-secret');expect(serialized).not.toContain('synthetic-registry-secret');
  expect(c.db.password).toBe('synthetic-db-secret');
 });
 it('fails closed on every missing or unsafe field',()=>{
  for(const k of Object.keys(env))expect(()=>anchorRunnerConfig({...env,[k]:undefined})).toThrow('runner_configuration_invalid');
  for(const bad of [
   {ALPHA_ANCHOR_DB_URL:'postgres://x:y@z/db'},{ALPHA_ANCHOR_MANIFEST:'relative/manifest.json'},{ALPHA_ANCHOR_RECEIPT_ROOT:'store'},
   {ALPHA_ANCHOR_PRINCIPAL_ID:'nope'},{ALPHA_ANCHOR_OWNERS:owner+','+owner},{ALPHA_ANCHOR_OWNERS:''},{ALPHA_ANCHOR_DB_USER:'postgres'},{ALPHA_ANCHOR_DB_USER:'s4_admin'},
   {ALPHA_ANCHOR_DB_PORT:'70000'},{ALPHA_ANCHOR_DB_INSECURE_LOOPBACK:'1'},{ALPHA_ANCHOR_INTERVAL_SECONDS:'1'},{ALPHA_ANCHOR_INTERVAL_SECONDS:'7200'},{ALPHA_ANCHOR_WATCHDOG_MS:'50'},
   {ALPHA_ANCHOR_REGISTRY_URL:'postgres://x:y@z/db'},
  ])expect(()=>anchorRunnerConfig({...env,...bad})).toThrow('runner_configuration_invalid');
 });
 it('accepts a pooler-style login name but still refuses administrative base names',()=>{
  expect(anchorRunnerConfig({...env,ALPHA_ANCHOR_DB_USER:'alpha_anchor_app.mzfcaabhuwtfvsvadvsv'}).db.user).toBe('alpha_anchor_app.mzfcaabhuwtfvsvadvsv');
  expect(()=>anchorRunnerConfig({...env,ALPHA_ANCHOR_DB_USER:'postgres.mzfcaabhuwtfvsvadvsv'})).toThrow('runner_configuration_invalid');
 });
 it('trusts an operator-supplied database CA file and omits SNI for an IP host',async()=>{
  const {writeFileSync,mkdtempSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
  const dir=mkdtempSync(join(tmpdir(),'alpha-dbca-'));const pem=join(dir,'ca.pem');writeFileSync(pem,'-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
  expect(anchorRunnerConfig({...env,ALPHA_ANCHOR_DB_CA_FILE:pem}).db.ssl).toMatchObject({rejectUnauthorized:true,servername:'db.example.test',ca:expect.stringContaining('BEGIN CERTIFICATE')});
  for(const file of ['relative/ca.pem',join(dir,'missing.pem')])expect(()=>anchorRunnerConfig({...env,ALPHA_ANCHOR_DB_CA_FILE:file})).toThrow('runner_configuration_invalid');
  const ip=anchorRunnerConfig({...env,ALPHA_ANCHOR_DB_HOST:'10.60.2.10'}).db.ssl as Record<string,unknown>;
  expect(ip.rejectUnauthorized).toBe(true);expect('servername' in ip).toBe(false);
 });
 it('allows plaintext only for an explicit loopback test target',()=>{
  const c=anchorRunnerConfig({...env,ALPHA_ANCHOR_DB_HOST:'localhost',ALPHA_ANCHOR_DB_INSECURE_LOOPBACK:'1'});
  expect(c.db.ssl).toBe(false);expect(c.db.host).toBe('127.0.0.1');
 });
});
