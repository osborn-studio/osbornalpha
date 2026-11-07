// src/lib/dq/datasets.ts
// Typed dataset registry (spec 3 §6.3; plan 3 contract C1). Producers take dataset strings ONLY from
// DATASETS (datasets.test.ts scans the source tree for stray literals). DQ_DATASET_INVENTORY lists
// every dataset with its producer and cadence: the /admin/dq dataset dropdown shows all of them,
// including ones that have not run yet (it creates no freshness rows), and producers read their
// cadence from inventoryEntry.
import type {Market} from '../facts/types';
import type {Cadence} from './freshness';
import {RECONCILE_PAIR_IDS,type ReconcilePairId} from './reconcile/types';

export const DATASETS={
 entities:{sec:'entities.sec',researchLink:'entities.research-link',identifiers:'entities.identifiers',cninfo:'entities.cninfo',ahLink:'entities.ah-link',windows:'entities.windows',submissions:'entities.sec-submissions'},
 facts:(m:Market)=>(m==='US'?'facts.us':'facts.cn') as 'facts.us'|'facts.cn',   // landed sync.ts identifiers (spec T4)
 acceptance:'facts.acceptance',
 filerCategories:'dq.filer-categories',
 reconcile:(p:ReconcilePairId)=>`reconcile.${p}` as const,
 calendar:(m:Market)=>(m==='US'?'dq.calendar.us':'dq.calendar.cn') as 'dq.calendar.us'|'dq.calendar.cn',
} as const;
export interface DatasetEntry{dataset:string;producer:string;cadence:Cadence}

const MARKETS:readonly Market[]=['US','CN'];
/** The four cycle pairs run weekly from the reconcile runner; the other three are recorded inline by their producers. */
const RECONCILE_PRODUCERS:Record<ReconcilePairId,{producer:string;cadence:Cadence}>={
 'us.companyfacts_vs_ixbrl':{producer:'reconcile',cadence:'weekly'},
 'cn.tushare_vs_cninfo_pdf_gold':{producer:'reconcile',cadence:'weekly'},
 'us.companyfacts_vs_gold':{producer:'reconcile',cadence:'weekly'},
 'facts.lineage_same_day':{producer:'reconcile',cadence:'weekly'},
 'sec.filing_date_vs_submissions':{producer:'enrich-acceptance',cadence:'event'},
 'sec.filer_category':{producer:'filer-categories',cadence:'event'},
 'entities.isin_hkex_vs_gleif':{producer:'fill-identifiers',cadence:'event'},
};

export const DQ_DATASET_INVENTORY:readonly DatasetEntry[]=[
 {dataset:DATASETS.entities.sec,producer:'sec-company-tickers',cadence:'event'},
 {dataset:DATASETS.entities.researchLink,producer:'research-entity-link',cadence:'event'},
 {dataset:DATASETS.entities.identifiers,producer:'fill-identifiers',cadence:'event'},
 {dataset:DATASETS.entities.cninfo,producer:'fill-cninfo-org-id',cadence:'event'},
 {dataset:DATASETS.entities.ahLink,producer:'link-ah',cadence:'event'},
 {dataset:DATASETS.entities.windows,producer:'backfill-windows',cadence:'event'},
 {dataset:DATASETS.entities.submissions,producer:'sec-submissions',cadence:'event'},
 ...MARKETS.map((m):DatasetEntry=>({dataset:DATASETS.facts(m),producer:'facts-sync',cadence:'daily'})),
 {dataset:DATASETS.acceptance,producer:'enrich-acceptance',cadence:'daily'},
 {dataset:DATASETS.filerCategories,producer:'filer-categories',cadence:'event'},
 ...RECONCILE_PAIR_IDS.map((p):DatasetEntry=>({dataset:DATASETS.reconcile(p),...RECONCILE_PRODUCERS[p]})),
 ...MARKETS.map((m):DatasetEntry=>({dataset:DATASETS.calendar(m),producer:'filing-calendar',cadence:'daily'})),
];
export const DQ_DATASET_NAMES:readonly string[]=DQ_DATASET_INVENTORY.map(e=>e.dataset);

/** The registry entry for `dataset`; throws unknown_dataset:<d> for anything not registered. */
export function inventoryEntry(dataset:string):DatasetEntry{
 const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);
 if(!e)throw new Error(`unknown_dataset:${dataset}`);
 return e;
}
