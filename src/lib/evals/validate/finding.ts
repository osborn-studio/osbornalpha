// src/lib/evals/validate/finding.ts
// Helpers of the spec §8–§10 validators. ValidatorFinding itself is the shared contract type (types.ts, integration decision 2).
import type {ValidatorFinding} from '../types';
export type {ValidatorFinding};
export const finding=(code:string,where:string,message:string):ValidatorFinding=>({code,where,message});
export const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const SHA256=/^[0-9a-f]{64}$/;
export const GIT_SHA=/^[0-9a-f]{40}$/;
export const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
export const ISO_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
