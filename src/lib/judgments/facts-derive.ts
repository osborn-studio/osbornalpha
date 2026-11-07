// src/lib/judgments/facts-derive.ts
// deriveMetricsAsOf (spec §12.2, S03): F4 composes the landed facts layer exactly like the public
// GET /api/facts/[ticker]/metrics?asOf= path (src/app/api/facts/[ticker]/metrics/route.ts) instead
// of asking plan 2 for a new export: readFacts(issuer, market, {concepts: DERIVE_CONCEPTS[market],
// asOf, history: true}) through the caller's (anon) FactsDb, refuse a truncated envelope
// (read_truncated), then deriveMetrics(rows, {market, asOf, basedOnRev: state_rev}). Only
// FORMULA_VERSION can be derived (unsupported_formula_version otherwise). The envelope is returned
// so input builders can freeze the derivation rows (spec §3.5 S04). The materialised
// financial_metrics cache is never read (S05).
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics} from '@/lib/facts/derive';
import type {FactsDb} from '@/lib/facts/types';
import type {DeriveAsOfResult,FactsMarket} from './types';
import {JudgmentError} from './errors';

export async function deriveMetricsAsOf(facts:Pick<FactsDb,'readFacts'>,issuer:string,market:FactsMarket,asOf:string,formulaVersion:string):Promise<DeriveAsOfResult>{
 if(formulaVersion!==FORMULA_VERSION)throw new JudgmentError('unsupported_formula_version',`${formulaVersion} (derivable: ${FORMULA_VERSION})`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new RangeError(`asOf must be YYYY-MM-DD, got ${asOf}`);
 const envelope=await facts.readFacts(issuer,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
 if(envelope.truncated)throw new JudgmentError('read_truncated',`read_facts truncated for ${issuer}/${market}@${asOf}`);
 if(envelope.rows.some(r=>r.issuer_id!==issuer||r.market!==market))throw new Error(`derive_scope_mismatch:${issuer}/${market}`);
 return {metrics:deriveMetrics(envelope.rows,{market,asOf,basedOnRev:envelope.stateRev}),envelope};
}
