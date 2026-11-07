// src/lib/company/fixtures/manifest.test.ts
// spec §12.0 + §0 #72: the manifest lists the recorded fixtures (sha256 checked against the bytes) and the
// acceptance expectations transcribed by a human. Entries not yet transcribed stay `pending`: they are
// SKIPPED here (and in e2e) and listed by id, never filled from implementation output.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {containsPending,EXPECTATION_KINDS,isReady,loadManifest} from './manifest';

const manifest=loadManifest();
const pending=manifest.expectations.filter(e=>!isReady(e));

describe('company fixture manifest',()=>{
 it('has unique ids and known kinds',()=>{
  const ids=[...manifest.fixtures.map(f=>f.id),...manifest.expectations.map(e=>e.id)];
  expect(new Set(ids).size).toBe(ids.length);
  for(const e of manifest.expectations)expect(EXPECTATION_KINDS).toContain(e.kind);
 });
 it('every fixture file matches its recorded sha256',()=>{
  expect(manifest.fixtures.length).toBeGreaterThanOrEqual(3);
  for(const f of manifest.fixtures){
   const sha=createHash('sha256').update(readFileSync(f.path)).digest('hex');
   expect(sha,f.path).toBe(f.sha256);
  }
 });
 it('a ready entry carries no pending marker (status and content agree)',()=>{
  for(const e of manifest.expectations)if(e.status==='ready'){
   expect(containsPending(e.expected),e.id).toBe(false);
   expect(containsPending(e.source),e.id).toBe(false);
  }
 });
 it('lists pending entries (owner items, spec §0 #72)',()=>{
  if(pending.length)console.info(`[manifest] pending (skipped until transcribed): ${pending.map(e=>e.id).join(', ')}`);
  expect(pending.length+manifest.expectations.filter(isReady).length).toBe(manifest.expectations.length);
 });
 for(const e of manifest.expectations){
  if(!isReady(e)){it.skip(`pending (human transcription): ${e.id}`,()=>{});continue;}
  it(`${e.id}: provenance recorded by a human`,()=>{
   expect(e.source.document.trim()).not.toBe('');
   expect(e.source.page_or_row.trim()).not.toBe('');
   expect(e.source.url).toMatch(/^https:\/\//);
   expect(e.source.transcribed_by.trim()).not.toBe('');
   expect(e.source.transcribed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
 }
});
