// Topic plan T6.1: public assembly and resolver failure semantics.
import {expect,it} from 'vitest';
import {assemble} from './assemble';
import {TopicError} from './errors';
import {deps,input,withAsOf,failingFor} from './fixtures/assemble';
it('is idempotent: same draft and cutoff give the same snapshot hash',async()=>{
 const a=await assemble(deps,input),b=await assemble(deps,input);expect(a.snapshotHash).toBe(b.snapshotHash);expect(a.snapshotText).toBe(b.snapshotText);
});
it('defaults as_of to the cutoff and rejects a later one',async()=>{
 expect((await assemble(deps,input)).evidence.every(e=>e.as_of<=input.cutoff)).toBe(true);
 await expect(assemble(deps,withAsOf(input,1,'2027-01-01T00:00:00.000Z'))).rejects.toEqual(new TopicError('publish_blocked:as_of_after_cutoff'));
});
it('keeps only the public projection: no admin_only mark and no withheld value in the snapshot text',async()=>{
 const a=await assemble(deps,input);
 expect(a.snapshotText).not.toContain('admin_only');expect(a.snapshotText).not.toContain('987654321.12');expect(a.maskedInPublic).toEqual([3]);
 expect(a.adminResolved[2].state).toBe('ok');expect(JSON.stringify(a.adminResolved[2])).toContain('987654321.12');
});
it('flags a degraded batch above 20% resolver errors',async()=>{
 const a=await assemble({...deps,resolver:failingFor('macro_observation')},input);expect([a.degraded,a.resolverErrors]).toEqual([true,2]);
});
it('rejects the same ref twice',async()=>{
 const i=structuredClone(input);i.draft.evidence[1].ref={...i.draft.evidence[0].ref,locator:{series_id:'UNRATE'}};
 await expect(assemble(deps,i)).rejects.toEqual(new TopicError('publish_blocked:duplicate_ref'));
});
it('normalizes explicit as_of and rejects invalid refs',async()=>{
 const a=await assemble(deps,withAsOf(input,1,'2026-11-13T16:00:00-08:00'));
 expect(a.evidence[0].as_of).toBe(input.cutoff);
 const i=structuredClone(input);i.draft.evidence[0].ref.id='invalid';
 await expect(assemble(deps,i)).rejects.toEqual(new TopicError('publish_blocked:invalid_ref'));
});
it('sorts stable ordinals without mutating the draft and records resolver versions',async()=>{
 const i=structuredClone(input);i.draft.evidence.reverse();const before=structuredClone(i);
 const a=await assemble(deps,i);expect(a.evidence.map(e=>e.ordinal)).toEqual([1,2,3,4]);expect(i).toEqual(before);
 expect(a.snapshot.resolver_versions).toEqual(deps.resolver.versions());
});
it('does not degrade empty evidence or a batch at exactly twenty percent errors',async()=>{
 const i=structuredClone(input);i.draft.evidence=[];
 expect(await assemble(deps,i)).toMatchObject({degraded:false,resolverErrors:0});
 const resolver={...deps.resolver,resolve:async(...args:Parameters<typeof deps.resolver.resolve>)=>{
  const r=await deps.resolver.resolve(...args);return {...r,receipt:{errors:args[1].audience==='public'?[{index:0,kind:args[0][0].kind,message:'test'}]:[]}};
 }};
 const extended=structuredClone(input);extended.draft.evidence.push({...extended.draft.evidence[0],ordinal:5,ref:{...extended.draft.evidence[0].ref,as_of:'2026-11-13T00:00:00.000Z'}});
 expect(await assemble({...deps,resolver},extended)).toMatchObject({degraded:false,resolverErrors:1});
});
