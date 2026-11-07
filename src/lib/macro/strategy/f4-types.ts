// src/lib/macro/strategy/f4-types.ts
// F4 read-model types used by the pure "F4 判定" mark selection (spec 2026-11-07 §5.2) before f4-client.ts exists (Task 11).
// Copied verbatim from the plan's dependency-injection contract; f4-client.ts imports and re-exports these, never redeclares.
import type {Regime} from './contract';
export interface F4CardLite{judgment_id:string;lifecycle:string;calibration:string;as_of:string;methodology:{id:string;version:string};selected:Regime|null}
export interface F4JudgmentDetail{judgment_id:string;as_of:string;selected:Regime|null;
 inputs:{kind:string;ref:Record<string,unknown>;snapshot:Record<string,unknown>}[];
 settlements:{settlement_id?:string;outcome:string|null;realized:unknown;evidence:Record<string,unknown>|null;settled_at:string}[]}
