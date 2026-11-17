import {expect,it,vi} from 'vitest';
import {strategyDbOver,type StrategyView} from './db';
import {sha256Hex} from './hash';
import {factViewKey,materializeFactView,memoKey,type MemoState} from './memo';
import {snap} from './testing/fixture';
const state=():MemoState=>({snapshots:{US:snap('US','2026-11-03T00:00:00Z',[]),CN:snap('CN','2026-11-03T00:00:00Z',[])},state:{US:{revision:1,input_revision:1},CN:{revision:1,input_revision:1}},catalog_version:'cat/1'});
const key=(s=state(),codeVersion='code/1',params={boundary:'event_day'})=>memoKey({kind:'cycle_table',params,state:s,codeVersion});
const row=():StrategyView=>({view_key:factViewKey(key()),kind:'cycle_table',identity:{},manifest_id:'11111111-1111-4111-8111-111111111111',view_json:'{"manifest_id":"11111111-1111-4111-8111-111111111111","view":{}}',view_sha256:'',code_version:'code/1'});
it('every component of the identity changes the persisted key and misses',async()=>{
 const original=factViewKey(key());const keys=new Set([original]);
 for(const region of ['US','CN'] as const){
  for(const change of [
   (s:MemoState)=>{s.snapshots[region]!.snapshot_id='other';},
   (s:MemoState)=>{s.snapshots[region]!.revision++;},
   (s:MemoState)=>{s.snapshots[region]!.created_at='2026-11-04T00:00:00Z';},
   (s:MemoState)=>{s.state[region]!.revision++;},
   (s:MemoState)=>{s.state[region]!.input_revision++;},
  ]){const s=state();change(s);keys.add(factViewKey(key(s)));}
 }
 const s=state();s.catalog_version='cat/2';keys.add(factViewKey(key(s)));keys.add(factViewKey(key(state(),'code/2')));keys.add(factViewKey(key(state(),'code/1',{boundary:'month_end'})));
 expect(keys.size).toBe(14);
 const stored=row();stored.view_sha256=sha256Hex(stored.view_json);
 const db=strategyDbOver({rpc:async()=>({outcome:'inserted'}),select:async(_role,spec)=>spec.eq.view_key===original?[{...stored}]:[]});
 for(const viewKey of [...keys].slice(1))expect(await db.getStrategyView(viewKey)).toBeNull();
});
it.each(['hash','kind'])('reads one admin row, treats corrupt %s as a miss and logs no bodies',async bad=>{
 const stored=row();stored.view_sha256=sha256Hex(stored.view_json);
 if(bad==='hash')stored.view_json='private body';else stored.kind='review' as StrategyView['kind'];
 const log=vi.spyOn(console,'error').mockImplementation(()=>{}),select=vi.fn(async()=>[{...stored}]);
 const db=strategyDbOver({rpc:async()=>null,select});
 expect(await db.getStrategyView(stored.view_key)).toBeNull();
 expect(select).toHaveBeenCalledExactlyOnceWith('admin',{table:'macro_strategy_views',eq:{view_key:stored.view_key},order:[],limit:1});
 expect(log.mock.calls).toEqual([['[macro-strategy-view-corrupt]']]);log.mockRestore();
});
it.each(['invalid-json','wrong-kind','wrong-manifest'])('rebuilds a checksum-valid but corrupt %s stored value',async bad=>{
 const stored=row();
 if(bad==='invalid-json')stored.view_json='!';
 if(bad==='wrong-kind')stored.kind='transmission';
 if(bad==='wrong-manifest')stored.manifest_id='22222222-2222-4222-8222-222222222222';
 stored.view_sha256=sha256Hex(stored.view_json);
 const db=strategyDbOver({rpc:async()=>({outcome:'conflict'}),select:async()=>[{...stored}]}),compute=vi.fn(async()=>({manifest_id:row().manifest_id,view:{fresh:true}}));
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect((await materializeFactView(key(),compute,db)).value.view).toEqual({fresh:true});expect(compute).toHaveBeenCalledOnce();log.mockRestore();
});
