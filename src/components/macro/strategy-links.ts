// src/components/macro/strategy-links.ts
// WP-S6 (MACRO-P3): link-type tabs from the P1 workbench to the P3/P4 pages. Pure and client-safe; the flag
// (MACRO_STRATEGY_ENABLED) is read on the server and arrives as a prop, so a disabled build renders no link at all.
export type StrategyLinkKey='transmission'|'history'|'review';
export interface StrategyLinkTab{key:StrategyLinkKey;href:string}
export const STRATEGY_LINK_TABS:readonly StrategyLinkTab[]=[
 {key:'transmission',href:'/intel/macro/transmission'},
 {key:'history',href:'/intel/macro/history'},
 {key:'review',href:'/intel/macro/review'},
];
export const strategyLinkTabs=(enabled:boolean):readonly StrategyLinkTab[]=>enabled?STRATEGY_LINK_TABS:[];
