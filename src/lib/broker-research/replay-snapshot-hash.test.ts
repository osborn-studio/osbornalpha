import {expect,it} from 'vitest';
import {memoryBrokerResearchDb} from './memory-db';
import {replayPublication} from './replay';
import {T0,memoryBrokerDeps,seedPublished} from './testing';

it('fails replay when publication metadata changes with all evidence intact',async()=>{
 const db=memoryBrokerResearchDb({now:()=>T0}),d=memoryBrokerDeps({db}),{publicationId}=await seedPublished(d);
 expect((await replayPublication(d,publicationId)).ok).toBe(true);
 const pub=(await db.getPublication(publicationId))!;db.replaceSnapshot(publicationId,{...pub.snapshot,revision:99});
 expect(await replayPublication(d,publicationId)).toMatchObject({ok:false,snapshotHashOk:false,mismatches:[]});
});
