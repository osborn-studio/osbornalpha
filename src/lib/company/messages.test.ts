// src/lib/company/messages.test.ts
// Every concept of the catalog and every metric name of both markets has a zh and en label in
// messages/{zh,en}/company.json (plan 2026-11-06 Task 11; spec §5.3, §5.4, §0 #66).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import {FACT_CONCEPTS} from '@/lib/facts/concepts';
import {metricNames} from '@/lib/facts/derive';

const load=(l:'zh'|'en')=>JSON.parse(readFileSync(resolve(process.cwd(),'messages',l,'company.json'),'utf8'));
describe('company messages',()=>{
 for(const l of ['zh','en'] as const){
  it(`${l}: labels every catalog concept (FACT_CONCEPTS.length entries)`,()=>{
   const m=load(l);
   for(const c of FACT_CONCEPTS)expect(typeof m.concepts[c.id],c.id).toBe('string');
   expect(Object.keys(m.concepts)).toHaveLength(FACT_CONCEPTS.length);
  });
  it(`${l}: labels every metric of US and CN`,()=>{
   const m=load(l);
   for(const n of new Set([...metricNames('US'),...metricNames('CN')]))expect(typeof m.metrics.names[n],n).toBe('string');
  });
 }
});
