// src/lib/broker-research/versions.ts
// Version constants of every behavior-affecting component of the foreign broker research module
// (plan 2026-11-06 §仓库约定 版本常量; spec §4.3, §5.2–§5.4, §6.2, §6.4, §7.1, §4.11).
// A change in what a component computes requires a new version string here. The SQL strings
// 'upside/1' and 'broker-rules/1' must equal UPSIDE_FORMULA_VERSION / RULES_VERSION (asserted by
// the integration suite, block 2).
export const TYPED_VERSION='typed/1';
export const MERGE_VERSION='merge/1';
export const LOCATE_VERSION='locate/1';
export const TICKER_VERSION='parseBrokerTicker/1';
export const CURRENCY_MARKS_VERSION='currency-marks/1';
export const RULES_VERSION='broker-rules/1';
export const DISCLOSURE_VERSION='disclosure/1';
export const GROUNDING_VERSION='grounding/1';
export const OVERLAP_VERSION='overlap/1';
export const SCHEMA_VERSION='extract-schema/1';
export const EXTRACT_PROMPT_VERSION='broker-extract/1';
export const SUMMARY_PROMPT_VERSION='independent-summary/1';
export const UPSIDE_FORMULA_VERSION='upside/1';
export const CLAIM_METHODOLOGY_VERSION='broker-claim/1';
