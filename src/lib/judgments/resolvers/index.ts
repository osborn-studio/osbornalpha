// src/lib/judgments/resolvers/index.ts
// The v1 resolver table (spec §7.3). resolverFor() is the single lookup used by settle, registration and the
// quarantine hook: recommendation_hit belongs to the private adapter (never public settlements, §11.2) and
// industry_aggregate is defined by the industry spec (not in v1); both, and unknown names, are invalid_condition.
// MAX_FETCH_MS feeds the settle cron's per-batch worst case (spec §7.1).
import {JudgmentError} from '../errors';
import type {Resolver} from '../types';
import {factMetricResolver} from './facts';
import {macroRegimeReplayResolver} from './macro';
import {priceReturnResolver} from './price';

export const RESOLVERS={price_return:priceReturnResolver,fact_metric:factMetricResolver,macro_regime_replay:macroRegimeReplayResolver} as const;
export type ImplementedResolver=keyof typeof RESOLVERS;
export const MAX_FETCH_MS=Math.max(...Object.values(RESOLVERS).map(r=>r.maxFetchMs));
export function resolverFor(name:string):Resolver{
 if(name==='recommendation_hit')throw new JudgmentError('invalid_condition','resolver_not_public:recommendation_hit');
 const r=(RESOLVERS as Record<string,Resolver|undefined>)[name];
 if(!r)throw new JudgmentError('invalid_condition',`resolver_unavailable:${name}`);
 return r;
}
