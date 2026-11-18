// Topic plan T6.2: snapshot identity and publication contract (A3).
import {expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {parseRef,refHash} from '@/lib/evidence/ref';
import {RESOLVE_STATES} from '@/lib/evidence/resolve';
import {buildSnapshot,countsOf,COUNT_ORDER} from './snapshot';
import {deps,input} from './fixtures/assemble';
import {memoryTopicsDb} from './memory-db';
async function prepared(){
 const ordered=input.draft.evidence.map(e=>({...e,ref:parseRef({...e.ref,as_of:e.ref.as_of??input.cutoff})}));
 const {resolved}=await deps.resolver.resolve(ordered.map(e=>e.ref),{audience:'public',locale:'zh',now:deps.now()});
 return {ordered,resolved};
}
it('copies every ref and content block into a canonical public snapshot',async()=>{
 const {ordered,resolved}=await prepared();
 const a=buildSnapshot(input,ordered,resolved,deps.resolver.versions());
 expect(a.snapshot.evidence).toHaveLength(input.draft.evidence.length);
 ordered.forEach((e,n)=>{
  expect(a.snapshot.evidence[n]).toEqual({...e,ref_hash:refHash(e.ref),resolved:resolved[n]});
  expect(a.evidence[n]).toEqual({ordinal:e.ordinal,kind:e.ref.kind,ref:e.ref,ref_hash:refHash(e.ref),as_of:e.ref.as_of,state:resolved[n].state,digest:resolved[n].state==='ok'?resolved[n].digest:null,section_key:e.section_key});
  expect(a.evidence[n].digest===null).toBe(a.evidence[n].state!=='ok');
 });
 expect(Object.values(a.snapshot.counts).reduce((a,b)=>a+b,0)).toBe(input.draft.evidence.length);
 expect(Object.keys(a.snapshot.freshness_at_publication).sort()).toEqual([...new Set(resolved.flatMap(r=>r.freshness?[r.freshness.dataset]:[]))].sort());
 expect(a.snapshotText).toBe(canonicalJson(a.snapshot));expect(a.snapshotHash).toBe(sha256Hex(a.snapshotText));
 expect(JSON.parse(a.snapshotText)).toEqual(a.snapshot);
 for(const key of ['expected_slots','sections','entries'] as const)expect(a.snapshot[key]).toEqual(input.draft[key]);
 expect(a.snapshot.contract_version).toBe('evidence-ref/1');expect(a.snapshot.resolver_versions).toEqual(deps.resolver.versions());
 expect(a.snapshot.topic).toEqual({...input.topic,title:input.draft.title,dek:input.draft.dek});expect(a.snapshot.summary).toBeNull();
});
it('zero-fills all six states and exports the publication display order',()=>{
 expect(countsOf([])).toEqual(Object.fromEntries(RESOLVE_STATES.map(s=>[s,0])));
 expect(COUNT_ORDER).toEqual(['ok','withheld','missing','not_served','retracted','unsupported']);
});
it('uses the worst freshness per dataset independent of evidence order',async()=>{
 const {ordered,resolved}=await prepared();
 for(const statuses of [['fresh','unknown','stale'],['stale','fresh','unknown'],['fresh','unknown','fresh']] as const){
  const rows=resolved.map((r,n)=>({...r,freshness:{dataset:'shared',status:statuses[n%3],checked_at:input.cutoff}}));
  expect(buildSnapshot(input,ordered,rows,{}).snapshot.freshness_at_publication).toEqual({shared:statuses.includes('stale' as never)?'stale':'unknown'});
 }
});
it('strips admin markers defensively without changing non-ok public results',async()=>{
 const {ordered,resolved}=await prepared();const original=structuredClone(resolved);
 const marked=resolved.map(r=>({...r,admin_only:true as const}));
 const a=buildSnapshot(input,ordered,marked,{});
 expect(a.snapshotText).not.toContain('"admin_only"');expect(a.snapshotText).not.toContain('987654321.12');
 expect(a.snapshot.evidence.map(e=>e.resolved)).toEqual(original);expect(marked.every(r=>r.admin_only)).toBe(true);
});
it('satisfies the memory publish contract',async()=>{
 const {ordered,resolved}=await prepared(),a=buildSnapshot(input,ordered,resolved,{}),db=memoryTopicsDb(),actor='10000000-0000-4000-8000-000000000001';
 const t=await db.createTopic({...input.topic,body:input.draft,actor});
 const receiptId=await db.recordDisclosure({topicId:t.topic_id,draftHash:t.draft_hash,checks:[],passed:true,codeVersion:'test',actor});
 await expect(db.publish({topicId:t.topic_id,expectedDraftHash:t.draft_hash,snapshotText:a.snapshotText,evidence:a.evidence,summaryId:null,receiptId,cutoff:input.cutoff,actor})).resolves.toMatchObject({version_no:1});
});
