// src/lib/industry/sw2021.ts
// SW2021 code aliases (spec 7th draft K3, evidence docs/audits/2026-11-06-industry-research/03-tushare-verification.md
// §1.2 item 6): index_member_all reports 特钢Ⅲ as 850412.SI while index_classify (the tree) has 850401.SI. Member
// codes are mapped to the tree's code before keying a source record. Part of METHOD_CONFIG (Task 10), so a change
// is a method-version change.
export const SW2021_CODE_ALIASES:Readonly<Record<string,string>>=Object.freeze({'850412.SI':'850401.SI'});
/** The tree's code for a member code (identity when no alias). */
export const canonicalSwCode=(code:string):string=>SW2021_CODE_ALIASES[code]??code;
