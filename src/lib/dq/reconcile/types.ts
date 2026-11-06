// src/lib/dq/reconcile/types.ts
// Reconciliation shared types (spec 3 §5; plan 3 contract C3). Task 2 lands only the pair registry
// ids, which the dataset registry needs; Task 13 adds the rest of C3 to this file and must not change
// these two exports.
export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
