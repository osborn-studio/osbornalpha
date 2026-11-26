// src/lib/dq/datasets.test.ts
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {FRESHNESS} from '../industry/vendor/types';
import {REGISTRY as methodologies} from '../judgments/registry';
import {SOURCE_CATALOG} from '../sources/catalog';
import {CADENCES} from './freshness';
import {DATASETS,DQ_DATASET_INVENTORY,DQ_DATASET_NAMES,inventoryEntry} from './datasets';
import {RECONCILE_PAIRS} from './reconcile/pairs';
import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';

// A dataset literal anywhere but the registry means a producer bypassed DATASETS (spec 3 §6.3).
const names=[...DQ_DATASET_NAMES].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
const LITERAL=new RegExp("(['\"`])("+names.join('|')+")\\1",'g');
const EXEMPT=new Set([
 'src/lib/dq/datasets.ts', // Defines the names.
 'src/lib/industry/vendor/types.ts', // The Gildata owner module keeps its own constant.
 'src/lib/judgments/types.ts', // Frozen formula input documents the quarantine dataset in the DB contract.
]);

// These strings also name UI views, translation namespaces, tables, adapters and audit actions.
// Check the context of each match so a dataset literal elsewhere on the same line is still caught.
function otherMeaning(path:string,name:string,before:string):boolean{
 if(name==='judgments')return /(?:Translations\(|\.from\(|\.select\(|table:|adapter:|originFor\('judgment',|internalErrorResponse\(e,|view === |'tracking',\s*)$/.test(before)
  ||(path==='src/i18n/request.ts'&&before.trim()==='');
 if(name==='broker_research')return /(?:purpose:|object_type:)$/.test(before);
 if(name==='judgments.settle')return /audit\(.*\},$/.test(before);
 return name==='documents.extract'&&before.endsWith('adminPost<Ctx>(');
}
function sources(dir:string):string[]{
 const out:string[]=[];
 for(const name of readdirSync(dir)){
  if(name==='node_modules')continue;
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
   expect(e.producer).toMatch(/^[a-z][a-z0-9_-]{0,63}$/);
   expect(CADENCES).toContain(e.cadence);
  }
 });
 it('covers every leaf and each supported family member',()=>{
  const leaves=(value:unknown):string[]=>typeof value==='string'?[value]:
   value&&typeof value==='object'?Object.values(value).flatMap(leaves):[];
  const expanded=[...leaves(DATASETS),...RECONCILE_PAIR_IDS.map(DATASETS.reconcile),
   ...methodologies.map(m=>DATASETS.judgments.produce(m.id)),
   ...(['US','CN'] as const).flatMap(m=>[DATASETS.facts(m),DATASETS.calendar(m)]),
   ...(['sw2021','sic'] as const).flatMap(s=>[DATASETS.industry.aggregate(s),DATASETS.industry.memberships(s),DATASETS.industry.classifications(s)]),
   ...(['edgar','cninfo','hkexnews'] as const).map(DATASETS.documents.sync)];
  expect([...new Set(expanded)].sort()).toEqual([...DQ_DATASET_NAMES].sort());
 });
 it('pins the complete set of persisted dataset values',()=>{
  const expected=[
   'topics.replay','company.events','entities.sec','entities.research-link','entities.identifiers','entities.cninfo',
   'entities.ah-link','entities.windows','entities.sec-submissions','facts.us','facts.cn','facts.acceptance','dq.filer-categories',
   'reconcile.us.companyfacts_vs_ixbrl','reconcile.cn.tushare_vs_cninfo_pdf_gold','reconcile.us.companyfacts_vs_gold',
   'reconcile.facts.lineage_same_day','reconcile.sec.filing_date_vs_submissions','reconcile.sec.filer_category',
   'reconcile.entities.isin_hkex_vs_gleif','dq.calendar.us','dq.calendar.cn',
   'macro.fred','macro.akshare','judgments','judgments.settle','judgments.calibrate','judgments.produce.macro_regime',
   'industry.agg.sw2021','industry.agg.sic','industry.sw2021.memberships','industry.sic.memberships',
   'industry.sw2021.classifications','industry.sic.classifications','industry.sw2021.source','industry.marks','industry.official',
   'vendor.gildata.industry.members.sw2021','vendor.gildata.industry.fin.sw2021',
   'universe.csi300','issuers.a_stock','issuers.a_stock.targeted','facts.hk','documents.edgar','documents.cninfo','documents.hkexnews',
   'documents.upload','documents.extract','documents.candidates','broker_research',
  ];
  expect([...DQ_DATASET_NAMES].sort()).toEqual(expected.sort());
  expect(DQ_DATASET_NAMES).toHaveLength(50);
 });
 it('matches the Gildata owner datasets and their weekly batch producer',()=>{
  const entries=DQ_DATASET_INVENTORY.filter(e=>e.source==='gildata');
  expect(entries.map(e=>e.dataset).sort()).toEqual(Object.values(FRESHNESS).sort());
  for(const entry of entries)expect(entry).toMatchObject({producer:'industry-vendor-gildata',cadence:'weekly'});
 });
 it('identifies the catalogued sources and registered upstream datasets',()=>{
  const valid=new Set<string>(['derived','internal',...SOURCE_CATALOG.map(s=>s.id)]);
  for(const entry of DQ_DATASET_INVENTORY){
   const sources=Array.isArray(entry.source)?entry.source:[entry.source];
   expect(sources.length).toBeGreaterThan(0);
   for(const source of sources)expect(valid.has(source),entry.dataset).toBe(true);
   for(const upstream of entry.derivedFrom??[])expect(DQ_DATASET_NAMES).toContain(upstream);
  }
 });
 // TOPICS ↓
 it('registers the weekly topic replay producer',()=>{
  expect(inventoryEntry('topics.replay')).toMatchObject({dataset:'topics.replay',producer:'topic-verify',cadence:'weekly'});
 });
 // TOPICS ↑
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
   expect(inventoryEntry(DATASETS.reconcile(p))).toMatchObject({dataset:`reconcile.${p}`,producer:'reconcile',cadence:'weekly'});
  expect(inventoryEntry(DATASETS.reconcile('sec.filing_date_vs_submissions'))).toMatchObject({dataset:'reconcile.sec.filing_date_vs_submissions',producer:'enrich-acceptance',cadence:'event'});
  expect(inventoryEntry(DATASETS.reconcile('sec.filer_category'))).toMatchObject({dataset:'reconcile.sec.filer_category',producer:'filer-categories',cadence:'event'});
  expect(inventoryEntry(DATASETS.reconcile('entities.isin_hkex_vs_gleif'))).toMatchObject({dataset:'reconcile.entities.isin_hkex_vs_gleif',producer:'fill-identifiers',cadence:'event'});
  expect(inventoryEntry(DATASETS.calendar('US'))).toMatchObject({dataset:'dq.calendar.us',producer:'filing-calendar',cadence:'daily'});
  expect(inventoryEntry(DATASETS.facts('CN'))).toMatchObject({dataset:'facts.cn',producer:'facts-sync',cadence:'daily'});
  expect(inventoryEntry(DATASETS.company.events)).toMatchObject({dataset:'company.events',producer:'company-digest',cadence:'daily'});
  expect(()=>inventoryEntry('macro.cpi')).toThrow('unknown_dataset:macro.cpi');
 });
 it('finds no hard-coded dataset literal outside the registry',()=>{
  const hits=[...sources('src'),...sources('scripts')].filter(p=>!EXEMPT.has(p)).flatMap(p=>
   readFileSync(p,'utf8').split('\n').flatMap((line,i)=>!/^\s*(?:\/\/|\/\*|\*)/.test(line)&&[...line.matchAll(LITERAL)].some(m=>!otherMeaning(p,m[2],line.slice(0,m.index)))?[`${p}:${i+1}`]:[]));
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
