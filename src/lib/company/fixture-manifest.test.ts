// src/lib/company/fixture-manifest.test.ts
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {loadFixtureManifest,pendingExpectation} from './fixture-manifest';

describe('company fixture manifest (§12.0, §0 #72)',()=>{
 const m=loadFixtureManifest();
 it('every listed fixture exists and matches its recorded sha256 (bytes)',()=>{
  expect(m.fixtures.length).toBeGreaterThan(0);
  for(const f of m.fixtures)expect(createHash('sha256').update(readFileSync(f.path)).digest('hex'),f.id).toBe(f.sha256);
 });
 it('pending entries carry no expected value; transcribed entries carry value, source and transcriber',()=>{
  for(const e of m.expectations){
   expect(['pending','transcribed']).toContain(e.status);
   if(e.status==='pending'){expect(e.expected,e.id).toBeNull();expect(pendingExpectation(e.id)).toBe(true);}
   else{expect(e.expected,e.id).not.toBeNull();expect(e.transcribed_by,e.id).toBeTruthy();expect(e.transcribed_at,e.id).toBeTruthy();expect(e.source.page_or_row,e.id).toBeTruthy();expect(pendingExpectation(e.id)).toBe(false);}
  }
  expect(new Set(m.expectations.map(e=>e.id)).size).toBe(m.expectations.length);
 });
 it('unknown ids are treated as pending (acceptance skips, never passes vacuously)',()=>{expect(pendingExpectation('nope')).toBe(true);});
});
