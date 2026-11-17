import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {warmFactViews} from './fact-views';
import {memoryStrategyDb} from './db';
import {memoryStrategyPort} from './port';
import {fixture,snap} from './testing/fixture';
const now=()=>new Date('2026-11-07T00:00:00Z');
const port=()=>memoryStrategyPort(fixture({snapshots:[snap('US','2026-11-03T00:00:00Z',[]),snap('CN','2026-11-03T00:00:00Z',[])],publishState:{US:{revision:1,input_revision:1},CN:{revision:1,input_revision:1}}}));
beforeEach(()=>vi.stubEnv('MACRO_STRATEGY_ENABLED','1'));
afterEach(()=>vi.unstubAllEnvs());
it('builds all eight once with at most two builds, then one batch select finds all present',async()=>{
 const db=memoryStrategyDb(),p=port(),original=db.putManifest,put=vi.spyOn(db,'putManifest'),batch=vi.spyOn(db,'getStrategyViews'),single=vi.spyOn(db,'getStrategyView');
 let active=0,peak=0;
 put.mockImplementation(async(...args)=>{active++;peak=Math.max(peak,active);try{return await original(...args);}finally{active--;}});
 const args={port:p,db,codeVersion:'code',now};
 const first=await warmFactViews(args);expect(first).toHaveLength(8);expect(first.every(r=>r.outcome==='built')).toBe(true);expect(put).toHaveBeenCalledTimes(8);expect(peak).toBeLessThanOrEqual(2);
 expect((await warmFactViews(args)).map(r=>r.outcome)).toEqual(Array(8).fill('present'));
 expect(put).toHaveBeenCalledTimes(8);expect(batch).toHaveBeenCalledTimes(2);expect(single).not.toHaveBeenCalled();
});
it('isolates a failed build and retries only that view',async()=>{
 const db=memoryStrategyDb(),put=vi.spyOn(db,'putManifest').mockRejectedValueOnce(new Error('private'));
 const log=vi.spyOn(console,'error').mockImplementation(()=>{}),args={port:port(),db,codeVersion:'code',now};
 const first=await warmFactViews(args);expect(first.filter(r=>r.outcome==='failed')).toHaveLength(1);expect(first.filter(r=>r.outcome==='built')).toHaveLength(7);
 const second=await warmFactViews(args);expect(second.filter(r=>r.outcome==='built')).toHaveLength(1);expect(put).toHaveBeenCalledTimes(9);
 expect(JSON.stringify(log.mock.calls)).not.toContain('private');log.mockRestore();
});
it('skips without reads when off; skips uncacheable state',async()=>{
 const db=memoryStrategyDb(),p=port(),read=vi.spyOn(p,'activeSnapshot'),list=vi.spyOn(db,'getStrategyViews');
 vi.stubEnv('MACRO_STRATEGY_ENABLED','0');
 expect((await warmFactViews({port:p,db,codeVersion:'code',now})).every(r=>r.outcome==='skipped')).toBe(true);expect(read).not.toHaveBeenCalled();
 vi.stubEnv('MACRO_STRATEGY_ENABLED','1');vi.spyOn(p,'publishState').mockResolvedValue(null);
 expect((await warmFactViews({port:p,db,codeVersion:'code',now})).every(r=>r.outcome==='skipped')).toBe(true);expect(list).not.toHaveBeenCalled();
});
