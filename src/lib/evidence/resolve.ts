// Resolver contract and registry (topic spec 2026-11-16 §4.1).
// src/lib/evidence/resolve.ts
import {canonicalJson,sha256Hex} from './hash';
import type {EvidenceKind,EvidenceRef} from './ref';
import type {SourceDrawerPayload} from './drawer';
export const RESOLVE_STATES=['ok','missing','withheld','not_served','unsupported','retracted'] as const;
export type ResolveState=typeof RESOLVE_STATES[number];
export interface ResolveCtx{audience:'public'|'admin';now:Date;locale:'zh'|'en'}
export type Slot={value_text:string;unit:string}|string;
export interface Resolved{
 state:ResolveState;reason:string|null;ref:EvidenceRef;basis:'point_in_time'|'reconstruction'|null;
 display:{label:{zh:string;en:string};fact:{template:string;slots:Record<string,Slot>}|null;period:string|null;available_at:string|null};
 drawer:SourceDrawerPayload|{kind:EvidenceKind;identity:{id:string;label:string};reason:string}|null;
 digest:string|null;
 freshness:{dataset:string;status:'fresh'|'stale'|'unknown';checked_at:string}|null;
 admin_only?:true;
}
/** What the source holds now for the same identity (drift check, spec §5.4). `value` is public-safe or null. */
export interface LatestIdentity{state:'ok'|'retracted'|'withheld'|'missing';object_id:string|null;
 value:{value_text:string;unit:string;period:string;available_at:string}|null;newer_period:string|null;reason:string|null}
export interface EvidenceResolver<K extends EvidenceKind=EvidenceKind>{
 kind:K;code_version:string;
 resolve(refs:EvidenceRef[],ctx:ResolveCtx):Promise<Resolved[]>;
 latestIdentity(ref:EvidenceRef):Promise<LatestIdentity|null>;
}
export interface ResolveReceipt{errors:{index:number;kind:EvidenceKind;message:string}[]}
export interface Resolver{
 resolve(refs:EvidenceRef[],ctx:ResolveCtx):Promise<{resolved:Resolved[];receipt:ResolveReceipt}>;
 latestIdentity(ref:EvidenceRef):Promise<LatestIdentity|null>;
 versions():Record<string,string>;
}

export function missing(ref:EvidenceRef,reason:string,label:{zh:string;en:string}={zh:'',en:''}):Resolved{
 return {state:'missing',reason,ref,basis:null,display:{label,fact:null,period:null,available_at:null},drawer:null,digest:null,freshness:null};
}
export function digestOf(fact:NonNullable<Resolved['display']['fact']>,identity:{id:string;label:string}):string{
 return sha256Hex(canonicalJson({fact,identity}));
}
export function createResolver(registry:readonly EvidenceResolver[]):Resolver{
 const byKind=new Map(registry.map(r=>[r.kind,r]));
 return {
  async resolve(refs,ctx){
   const groups=new Map<EvidenceKind,number[]>();
   refs.forEach((ref,i)=>{const indexes=groups.get(ref.kind)??[];indexes.push(i);groups.set(ref.kind,indexes);});
   const resolved:Resolved[]=new Array(refs.length);const receipt:ResolveReceipt={errors:[]};
   for(const [kind,indexes] of groups){
    const resolver=byKind.get(kind);
    if(!resolver){for(const i of indexes)resolved[i]={...missing(refs[i],'no_resolver'),state:'unsupported'};continue;}
    try{
     const answers=await resolver.resolve(indexes.map(i=>refs[i]),ctx);
     if(answers.length!==indexes.length)throw new Error('resolver_length_mismatch');
     indexes.forEach((i,j)=>{resolved[i]=answers[j];});
    }catch(error){
     const message=error instanceof Error?error.message:String(error);
     for(const index of indexes){resolved[index]=missing(refs[index],'resolver_error');receipt.errors.push({index,kind,message});}
    }
   }
   receipt.errors.sort((a,b)=>a.index-b.index);
   return {resolved,receipt};
  },
  async latestIdentity(ref){return byKind.get(ref.kind)?.latestIdentity(ref)??null;},
  versions(){return Object.fromEntries([...byKind].map(([kind,resolver])=>[kind,resolver.code_version]));},
 };
}
