import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,symlinkSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseRunnerManifest,readRunnerManifest} from './anchor-manifest';

const valid=()=>({store_id:randomUUID(),database_identity:randomUUID(),deployment_generation:3,
  authorized_owner_scope:['a'.repeat(64),'b'.repeat(64)],format_version:1});

describe('runner manifest parser',()=>{
 it('accepts exactly the five operator fields from a string or buffer',()=>{
  const m=valid();
  expect(parseRunnerManifest(JSON.stringify(m))).toEqual(m);
  expect(parseRunnerManifest(Buffer.from(JSON.stringify(m)))).toEqual(m);
 });
 it('rejects a missing field',()=>{
  for(const key of Object.keys(valid())){const m:Record<string,unknown>=valid();delete m[key];
   expect(()=>parseRunnerManifest(JSON.stringify(m)),key).toThrow('invalid_schema');}
 });
 it('rejects an unknown field, a non-object and duplicate keys',()=>{
  expect(()=>parseRunnerManifest(JSON.stringify({...valid(),checkpoint_endpoint_ref:'x'}))).toThrow('invalid_schema');
  expect(()=>parseRunnerManifest(JSON.stringify([valid()]))).toThrow('invalid_schema');
  expect(()=>parseRunnerManifest('null')).toThrow('invalid_schema');
  const m=valid();expect(()=>parseRunnerManifest(JSON.stringify(m).replace('{','{"format_version":1,'))).toThrow('duplicate_key');
 });
 it('rejects identities that are not UUIDs',()=>{
  expect(()=>parseRunnerManifest(JSON.stringify({...valid(),store_id:'store-1'}))).toThrow('invalid_schema');
  expect(()=>parseRunnerManifest(JSON.stringify({...valid(),database_identity:randomUUID().toUpperCase()}))).toThrow('invalid_schema');
 });
 it('rejects generations that are not non-negative safe integers',()=>{
  for(const g of [-1,1.5,'3',Number.MAX_SAFE_INTEGER+1,null])
   expect(()=>parseRunnerManifest(JSON.stringify({...valid(),deployment_generation:g})),String(g)).toThrow('invalid_schema');
  expect(parseRunnerManifest(JSON.stringify({...valid(),deployment_generation:0})).deployment_generation).toBe(0);
 });
 it('rejects owner scopes that are empty, non-hex, wrong length or duplicated',()=>{
  for(const s of [[],'a'.repeat(64),['A'.repeat(64)],['a'.repeat(63)],['a'.repeat(64),'a'.repeat(64)],[1]])
   expect(()=>parseRunnerManifest(JSON.stringify({...valid(),authorized_owner_scope:s})),JSON.stringify(s)).toThrow('invalid_schema');
 });
 it('rejects any format version other than 1 and oversized input',()=>{
  for(const v of [0,2,'1',1.0001])expect(()=>parseRunnerManifest(JSON.stringify({...valid(),format_version:v}))).toThrow('invalid_schema');
  expect(()=>parseRunnerManifest(JSON.stringify({...valid(),authorized_owner_scope:Array.from({length:2000},(_,i)=>i.toString(16).padStart(64,'0'))}))).toThrow('input_limit');
 });
});

describe('runner manifest file',()=>{
 it('reads only an absolute, operator-owned 0600 regular file',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'s4-manifest-'));const path=join(dir,'manifest.json');
  writeFileSync(path,JSON.stringify(valid()),{mode:0o600});
  expect(await readRunnerManifest(path)).toEqual(expect.objectContaining({format_version:1}));
  await expect(readRunnerManifest('manifest.json')).rejects.toThrow('scope_denied');
  chmodSync(path,0o644);await expect(readRunnerManifest(path)).rejects.toThrow('scope_denied');
  chmodSync(path,0o600);const link=join(dir,'link.json');symlinkSync(path,link);
  await expect(readRunnerManifest(link)).rejects.toThrow('scope_denied');
  await expect(readRunnerManifest(join(dir,'missing.json'))).rejects.toThrow();
 });
 it('rejects a file whose content fails the strict parser',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'s4-manifest-'));const path=join(dir,'manifest.json');
  writeFileSync(path,JSON.stringify({...valid(),extra:true}),{mode:0o600});
  await expect(readRunnerManifest(path)).rejects.toThrow('invalid_schema');
 });
});
