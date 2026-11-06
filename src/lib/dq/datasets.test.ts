// src/lib/dq/datasets.test.ts
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {CADENCES} from './freshness';
import {DATASETS,DQ_DATASET_INVENTORY,DQ_DATASET_NAMES,inventoryEntry} from './datasets';
import {RECONCILE_PAIRS} from './reconcile/pairs';
import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';

// A dataset literal anywhere but the registry means a producer bypassed DATASETS (spec 3 §6.3).
const LITERAL=/(['"`])(entities\.(?:sec|research-link|identifiers|cninfo|ah-link|windows|sec-submissions)|facts\.(?:us|cn|acceptance)|dq\.(?:calendar\.(?:us|cn)|filer-categories)|reconcile\.[a-z][a-z_.]*)\1/;
// db-contract.ts is a test-fixture module (shared FactsDb contract cases), not a producer.
const EXEMPT=new Set(['src/lib/dq/datasets.ts','src/lib/facts/db-contract.ts']);
function sources(dir:string):string[]{
 const out:string[]=[];
 for(const name of readdirSync(dir)){
  if(name==='node_modules'||name==='fixtures')continue;
  const p=join(dir,name);
  if(statSync(p).isDirectory())out.push(...sources(p));
  else if(/\.tsx?$/.test(name)&&!/\.test\.tsx?$/.test(name))out.push(p.replaceAll('\\','/'));
 }
 return out;
}

describe('DATASETS / DQ_DATASET_INVENTORY',()=>{
 it('lists every dataset once with a producer and a known cadence, within the 64-char column limit',()=>{
  expect(new Set(DQ_DATASET_NAMES).size).toBe(DQ_DATASET_NAMES.length);
  expect(DQ_DATASET_NAMES).toEqual(DQ_DATASET_INVENTORY.map(e=>e.dataset));
  for(const e of DQ_DATASET_INVENTORY){
   expect(e.dataset.length).toBeGreaterThan(0);
   expect(e.dataset.length).toBeLessThanOrEqual(64);
   expect(e.producer).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
   expect(CADENCES).toContain(e.cadence);
  }
 });
 it('expands every DATASETS leaf, market and reconcile pair into the inventory, and nothing else',()=>{
  const leaves=[...Object.values(DATASETS.entities),DATASETS.facts('US'),DATASETS.facts('CN'),DATASETS.acceptance,DATASETS.filerCategories,
   ...RECONCILE_PAIR_IDS.map(p=>DATASETS.reconcile(p)),DATASETS.calendar('US'),DATASETS.calendar('CN')];
  expect([...leaves].sort()).toEqual([...DQ_DATASET_NAMES].sort());
  expect(DQ_DATASET_NAMES).toHaveLength(7+2+1+1+7+2);
 });
 it('keeps the identifiers plans 1 and 2 already persist',()=>{
  expect(DATASETS.facts('US')).toBe('facts.us');
  expect(DATASETS.facts('CN')).toBe('facts.cn');
  expect(DATASETS.entities.sec).toBe('entities.sec');
  expect(DATASETS.entities.researchLink).toBe('entities.research-link');
  expect(DATASETS.reconcile('us.companyfacts_vs_ixbrl')).toBe('reconcile.us.companyfacts_vs_ixbrl');
  expect(DATASETS.calendar('CN')).toBe('dq.calendar.cn');
 });
 it('runs the four cycle pairs weekly from the reconcile runner and records the inline pairs as events',()=>{
  for(const p of ['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const)
   expect(inventoryEntry(DATASETS.reconcile(p))).toEqual({dataset:`reconcile.${p}`,producer:'reconcile',cadence:'weekly'});
  expect(inventoryEntry(DATASETS.reconcile('sec.filing_date_vs_submissions'))).toEqual({dataset:'reconcile.sec.filing_date_vs_submissions',producer:'enrich-acceptance',cadence:'event'});
  expect(inventoryEntry(DATASETS.reconcile('sec.filer_category'))).toEqual({dataset:'reconcile.sec.filer_category',producer:'filer-categories',cadence:'event'});
  expect(inventoryEntry(DATASETS.reconcile('entities.isin_hkex_vs_gleif'))).toEqual({dataset:'reconcile.entities.isin_hkex_vs_gleif',producer:'fill-identifiers',cadence:'event'});
  expect(inventoryEntry(DATASETS.calendar('US'))).toEqual({dataset:'dq.calendar.us',producer:'filing-calendar',cadence:'daily'});
  expect(inventoryEntry(DATASETS.facts('CN'))).toEqual({dataset:'facts.cn',producer:'facts-sync',cadence:'daily'});
  expect(()=>inventoryEntry('macro.cpi')).toThrow('unknown_dataset:macro.cpi');
 });
 it('finds no hard-coded dataset literal outside the registry',()=>{
  const hits=[...sources('src'),...sources('scripts')].filter(p=>!EXEMPT.has(p)).flatMap(p=>
   readFileSync(p,'utf8').split('\n').flatMap((line,i)=>LITERAL.test(line)?[`${p}:${i+1}`]:[]));
  expect(hits).toEqual([]);
 });
});

describe('ReconcilePairId ↔ pairs.ts (spec §6.3)',()=>{
 it('every registered pair is a cycle pair id, every cycle pair id is a ReconcilePairId, and each has an inventory entry',()=>{
  for(const id of Object.keys(RECONCILE_PAIRS))expect(CYCLE_PAIR_IDS as readonly string[]).toContain(id);
  for(const id of CYCLE_PAIR_IDS)expect(RECONCILE_PAIR_IDS as readonly string[]).toContain(id);
  for(const id of RECONCILE_PAIR_IDS)expect(DQ_DATASET_INVENTORY.map(e=>e.dataset)).toContain(DATASETS.reconcile(id));
 });
});
