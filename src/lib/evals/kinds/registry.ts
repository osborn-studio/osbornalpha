// src/lib/evals/kinds/registry.ts
// Which kinds scripts/evals/run.ts may run (spec §15.1, §0 R5-12, §14 kind_not_enabled). A kind whose
// prerequisite has not landed is registered with enabled:false and the reason; running it is a pre-run
// refusal (EvalError kind_not_enabled → exit 2). Unregistered kinds are refused the same way.
import {EvalError} from '../errors';
import type {EvalKind} from '../types';

export interface KindRegistryEntry{kind:EvalKind;enabled:boolean;reason?:string}
export const KIND_REGISTRY:readonly KindRegistryEntry[]=[
 {kind:'official_reconciliation',enabled:true},
 {kind:'replay_consistency',enabled:true},
 {kind:'dual_source',enabled:false,reason:'prerequisite: plan 3 merged'},
 {kind:'reference_regression',enabled:false,reason:'prerequisite: macro migrations'},
];
export const kindEntry=(kind:string):KindRegistryEntry|undefined=>KIND_REGISTRY.find(e=>e.kind===kind);
export function assertKindEnabled(kind:string):void{
 const e=kindEntry(kind);
 if(!e)throw new EvalError('kind_not_enabled',`kind not registered: ${kind}`,{kind});
 if(!e.enabled)throw new EvalError('kind_not_enabled',`${kind} is not enabled (${e.reason??'no reason recorded'})`,{kind,reason:e.reason??null});
}
