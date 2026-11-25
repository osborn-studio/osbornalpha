// src/lib/dq/datasets.ts
// Typed dataset registry (spec 3 §6.3; plan 3 contract C1). Producers take dataset strings ONLY from
// DATASETS (datasets.test.ts scans the source tree for stray literals). DQ_DATASET_INVENTORY lists
// every dataset with its producer and cadence: the /admin/dq dataset dropdown shows all of them,
// including ones that have not run yet (it creates no freshness rows), and producers read their
// cadence from inventoryEntry.
import type {SourceId} from '../sources/catalog';
import type {ListedSource} from '../documents/types';
import type {Scheme} from '../industry/types';
import type {Market} from '../facts/types';
import type {Cadence} from './freshness';
import {RECONCILE_PAIR_IDS,type ReconcilePairId} from './reconcile/types';

export const DATASETS={
 macro:{fred:'macro.fred',akshare:'macro.akshare'},
 judgments:{quarantine:'judgments',settle:'judgments.settle',calibrate:'judgments.calibrate',
  produce:<M extends string>(methodology:M)=>`judgments.produce.${methodology}` as const},
 industry:{aggregate:(s:Scheme)=>`industry.agg.${s}` as const,memberships:(s:Scheme)=>`industry.${s}.memberships` as const,
  classifications:(s:Scheme)=>`industry.${s}.classifications` as const,swSource:'industry.sw2021.source',marks:'industry.marks',official:'industry.official'},
 issuers:{aStock:'issuers.a_stock',targeted:'issuers.a_stock.targeted'},
 hkFacts:'facts.hk',
 documents:{sync:(s:ListedSource)=>`documents.${s}` as const,upload:'documents.upload',extract:'documents.extract',candidates:'documents.candidates'},
 brokerResearch:'broker_research',
 // TOPICS ↓
 topics:{replay:'topics.replay'},
 // TOPICS ↑
 // COMPANY
 company:{events:'company.events'},
 entities:{sec:'entities.sec',researchLink:'entities.research-link',identifiers:'entities.identifiers',cninfo:'entities.cninfo',ahLink:'entities.ah-link',windows:'entities.windows',submissions:'entities.sec-submissions'},
 facts:(m:Market)=>(m==='US'?'facts.us':'facts.cn') as 'facts.us'|'facts.cn',   // landed sync.ts identifiers (spec T4)
 acceptance:'facts.acceptance',
 filerCategories:'dq.filer-categories',
 reconcile:(p:ReconcilePairId)=>`reconcile.${p}` as const,
 calendar:(m:Market)=>(m==='US'?'dq.calendar.us':'dq.calendar.cn') as 'dq.calendar.us'|'dq.calendar.cn',
} as const;
export interface DatasetEntry{
 dataset:string;
 producer:string;
 cadence:Cadence;
 source:SourceId|readonly SourceId[]|'derived'|'internal';
 derivedFrom?:readonly string[];
}

const MARKETS:readonly Market[]=['US','CN'];
/** The four cycle pairs run weekly from the reconcile runner; the other three are recorded inline by their producers. */
const RECONCILE_PRODUCERS:Record<ReconcilePairId,Pick<DatasetEntry,'producer'|'cadence'|'derivedFrom'>>={
 'us.companyfacts_vs_ixbrl':{producer:'reconcile',cadence:'weekly',derivedFrom:[DATASETS.facts('US')]},
 'cn.tushare_vs_cninfo_pdf_gold':{producer:'reconcile',cadence:'weekly',derivedFrom:[DATASETS.facts('CN')]},
 'us.companyfacts_vs_gold':{producer:'reconcile',cadence:'weekly',derivedFrom:[DATASETS.facts('US')]},
 'facts.lineage_same_day':{producer:'reconcile',cadence:'weekly',derivedFrom:[DATASETS.facts('US'),DATASETS.facts('CN')]},
 'sec.filing_date_vs_submissions':{producer:'enrich-acceptance',cadence:'event',derivedFrom:[DATASETS.acceptance,DATASETS.entities.submissions]},
 'sec.filer_category':{producer:'filer-categories',cadence:'event',derivedFrom:[DATASETS.filerCategories]},
 'entities.isin_hkex_vs_gleif':{producer:'fill-identifiers',cadence:'event',derivedFrom:[DATASETS.entities.identifiers]},
};

export const DQ_DATASET_INVENTORY:readonly DatasetEntry[]=[
 // TOPICS ↓
 {dataset:DATASETS.topics.replay,producer:'topic-verify',cadence:'weekly',source:'derived'},
 // TOPICS ↑
 // COMPANY
 {dataset:DATASETS.company.events,producer:'company-digest',cadence:'daily',source:'derived'},
 {dataset:DATASETS.entities.sec,producer:'sec-company-tickers',cadence:'event',source:'sec'},
 {dataset:DATASETS.entities.researchLink,producer:'research-entity-link',cadence:'event',source:'derived'},
 {dataset:DATASETS.entities.identifiers,producer:'fill-identifiers',cadence:'event',source:['openfigi','gleif','hkex']},
 {dataset:DATASETS.entities.cninfo,producer:'fill-cninfo-org-id',cadence:'event',source:'cninfo'},
 {dataset:DATASETS.entities.ahLink,producer:'link-ah',cadence:'event',source:['openfigi','gleif','hkex']},
 {dataset:DATASETS.entities.windows,producer:'backfill-windows',cadence:'event',source:'derived'},
 {dataset:DATASETS.entities.submissions,producer:'sec-submissions',cadence:'event',source:'sec'},
 ...MARKETS.map((m):DatasetEntry=>({dataset:DATASETS.facts(m),producer:'facts-sync',cadence:'daily',source:m==='US'?'sec':'tushare'})),
 {dataset:DATASETS.acceptance,producer:'enrich-acceptance',cadence:'daily',source:'sec'},
 {dataset:DATASETS.filerCategories,producer:'filer-categories',cadence:'event',source:'sec'},
 ...RECONCILE_PAIR_IDS.map((p):DatasetEntry=>({source:'derived',dataset:DATASETS.reconcile(p),...RECONCILE_PRODUCERS[p]})),
 ...MARKETS.map((m):DatasetEntry=>({dataset:DATASETS.calendar(m),producer:'filing-calendar',cadence:'daily',source:m==='US'?'sec':'tushare'})),
 {dataset:DATASETS.macro.fred,producer:'ts-fred',cadence:'daily',source:'fred'},
 {dataset:DATASETS.macro.akshare,producer:'py-akshare',cadence:'daily',source:'akshare'},
 {dataset:DATASETS.judgments.quarantine,producer:'ts-judgments',cadence:'event',source:'derived'},
 {dataset:DATASETS.judgments.settle,producer:'ts-judgments',cadence:'daily',source:'derived'},
 {dataset:DATASETS.judgments.produce('macro_regime'),producer:'ts-judgments',cadence:'event',source:'derived',derivedFrom:[DATASETS.macro.fred,DATASETS.macro.akshare]},
 {dataset:DATASETS.judgments.calibrate,producer:'ts-judgments',cadence:'event',source:'derived',derivedFrom:[DATASETS.judgments.settle]},
 {dataset:DATASETS.issuers.aStock,producer:'load-a-share',cadence:'daily',source:['tushare','cninfo']},
 {dataset:DATASETS.issuers.targeted,producer:'load-a-share',cadence:'event',source:['tushare','cninfo']},
 {dataset:DATASETS.hkFacts,producer:'documents-candidates',cadence:'event',source:'derived',derivedFrom:[DATASETS.documents.candidates]},
 {dataset:DATASETS.brokerResearch,producer:'broker-research-verify',cadence:'daily',source:'internal'},
 {dataset:DATASETS.industry.aggregate('sw2021'),producer:'industry-agg',cadence:'weekly',source:'derived',derivedFrom:[DATASETS.facts('CN'),DATASETS.industry.memberships('sw2021')]},
 {dataset:DATASETS.industry.memberships('sw2021'),producer:'industry-sw-resolve',cadence:'weekly',source:'derived',derivedFrom:[DATASETS.industry.swSource]},
 {dataset:DATASETS.industry.classifications('sw2021'),producer:'industry-sw-classify',cadence:'weekly',source:'tushare'},
 {dataset:DATASETS.industry.aggregate('sic'),producer:'industry-agg',cadence:'weekly',source:'derived',derivedFrom:[DATASETS.facts('US'),DATASETS.industry.memberships('sic')]},
 {dataset:DATASETS.industry.memberships('sic'),producer:'industry-sic',cadence:'weekly',source:'sec'},
 {dataset:DATASETS.industry.classifications('sic'),producer:'industry-sic-classify',cadence:'weekly',source:'sec'},
 {dataset:DATASETS.industry.swSource,producer:'industry-sw-members',cadence:'weekly',source:'tushare'},
 {dataset:DATASETS.industry.marks,producer:'industry-marks',cadence:'weekly',source:'tushare'},
 // Official revisions are quarantined by the RPC itself. There is no separate batch or freshness writer.
 {dataset:DATASETS.industry.official,producer:'apply_observations',cadence:'event',source:'tushare'},
 {dataset:DATASETS.documents.sync('edgar'),producer:'documents-sync',cadence:'daily',source:'sec'},
 {dataset:DATASETS.documents.sync('cninfo'),producer:'documents-sync',cadence:'daily',source:'cninfo'},
 {dataset:DATASETS.documents.sync('hkexnews'),producer:'documents-sync',cadence:'daily',source:'hkexnews'},
 {dataset:DATASETS.documents.upload,producer:'documents-upload',cadence:'event',source:'internal'},
 {dataset:DATASETS.documents.extract,producer:'documents-extract',cadence:'daily',source:'derived',derivedFrom:[DATASETS.documents.sync('edgar'),DATASETS.documents.sync('cninfo'),DATASETS.documents.sync('hkexnews'),DATASETS.documents.upload]},
 {dataset:DATASETS.documents.candidates,producer:'documents-candidates',cadence:'daily',source:'derived',derivedFrom:[DATASETS.documents.extract]},
];
export const DQ_DATASET_NAMES:readonly string[]=DQ_DATASET_INVENTORY.map(e=>e.dataset);

/** The registry entry for `dataset`; throws unknown_dataset:<d> for anything not registered. */
export function inventoryEntry(dataset:string):DatasetEntry{
 const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);
 if(!e)throw new Error(`unknown_dataset:${dataset}`);
 return e;
}
