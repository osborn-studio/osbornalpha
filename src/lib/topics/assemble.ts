// Topic plan T6.1 / spec §5.1–§5.2: ordered public assembly and admin preview differences.
import {parseRef,refHash} from '@/lib/evidence/ref';
import type {Resolved,Resolver} from '@/lib/evidence/resolve';
import type {Category,DraftBody,EvidenceRowInput,RenderedSummary,TopicSnapshot} from './types';
import {TopicError} from './errors';
import {buildSnapshot} from './snapshot';
export interface AssembleInput{topic:{slug:string;category:Category};draft:DraftBody;cutoff:string;summary:RenderedSummary|null}
export interface Assembled{snapshot:TopicSnapshot;snapshotText:string;snapshotHash:string;evidence:EvidenceRowInput[];
 adminResolved:Resolved[];maskedInPublic:number[];degraded:boolean;resolverErrors:number}
export const DEGRADED_SHARE=0.2;
export async function assemble(d:{resolver:Resolver;now():Date},i:AssembleInput):Promise<Assembled>{
 const hashes=new Set<string>();
 const ordered=[...i.draft.evidence].sort((a,b)=>a.ordinal-b.ordinal).map(e=>{
  let ref;try{ref=parseRef({...e.ref,as_of:e.ref.as_of??i.cutoff});}catch{throw new TopicError('publish_blocked:invalid_ref');}
  if(Date.parse(ref.as_of)>Date.parse(i.cutoff))throw new TopicError('publish_blocked:as_of_after_cutoff');
  const hash=refHash(ref);if(hashes.has(hash))throw new TopicError('publish_blocked:duplicate_ref');hashes.add(hash);
  return {...e,ref};
 });
 const refs=ordered.map(e=>e.ref),now=d.now();
 const pub=await d.resolver.resolve(refs,{audience:'public',locale:'zh',now});
 const admin=await d.resolver.resolve(refs,{audience:'admin',locale:'zh',now});
 const resolverErrors=pub.receipt.errors.length;
 return {...buildSnapshot(i,ordered,pub.resolved,d.resolver.versions()),adminResolved:admin.resolved,
  maskedInPublic:ordered.filter((_,n)=>admin.resolved[n].state==='ok'&&pub.resolved[n].state!=='ok').map(e=>e.ordinal),
  degraded:ordered.length>0&&resolverErrors/ordered.length>DEGRADED_SHARE,resolverErrors};
}
