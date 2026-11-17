vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key,useLocale:()=> 'en'}));
import React, {act} from 'react';
import {create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, expect, it, vi} from 'vitest';
import {KeyIndicatorCards} from './KeyIndicatorCards';
import type {OverviewEnvelopeJson} from './view-model';
vi.mock('./use-macro-t',()=>({useMacroT:()=>({locale:'en',t:(k:string,v?:Record<string,unknown>)=>k+JSON.stringify(v??{})})}));
vi.mock('./IndicatorDetail',()=>({IndicatorDetail:(p:object)=>React.createElement('mock-detail',p)}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const row=(id:string)=>({series_id:id,observation_id:id,name:{zh:id,en:id},value_text:'4.2',unit:'pct',change:{kind:'pp' as const,value_text:'-0.1'},period_end:'2026-09-30',available_at:null,timeliness:'current' as const,status:'A' as const,retrieval_id:null,sparkline:['4.3','4.2']});
const env={snapshotId:'snap',asOf:'2026-10-01',indicators:['US_DFF','US_DGS10','US_CPI_YOY','US_UNRATE'].map(row)} as OverviewEnvelopeJson;
let tree:ReactTestRenderer;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());vi.unstubAllGlobals();});
it('renders envelope headers, first two expanded with cached snapshot created_at, and collapsed sparklines',async()=>{
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({snapshot:{snapshot_id:'snap',created_at:'2026-10-02T12:00:00Z'}})}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>{tree=create(React.createElement(KeyIndicatorCards,{region:"US",env}));});
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(tree.root.findAllByType('button').map(b=>b.props['aria-expanded'])).toEqual([true,true,false,false]);
 const details=tree.root.findAllByType('mock-detail' as never);
 expect(details).toHaveLength(2);expect(details[0].props).toMatchObject({compact:true,asOf:'2026-10-02T12:00:00Z',snapshotObservationId:'US_DFF'});
 expect(JSON.stringify(tree.toJSON())).toContain('4.2');expect(JSON.stringify(tree.toJSON())).toContain('keyCards.snapshot');
 expect(tree.root.findAllByType('svg')).toHaveLength(2);
 await act(async()=>{tree.root.findAllByType('button')[2].props.onClick();});
 expect(tree.root.findAllByType('mock-detail' as never)).toHaveLength(3);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not load live history when timestamp lookup fails; missing and restricted stay labelled',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({})})));
 await act(async()=>{tree=create(React.createElement(KeyIndicatorCards,{region:"US",env:{...env,indicators:[{...row('US_DFF'),status:'M',value_text:null,change:null,sparkline:[]},{...row('US_DGS10'),status:'R',value_text:null,change:null,sparkline:[]}]}}));});
 expect(tree.root.findAllByType('mock-detail' as never)).toHaveLength(0);
 const text=JSON.stringify(tree.toJSON());expect(text).toContain('states.missing');expect(text).toContain('states.withheld');expect(text).not.toContain('4.2');
});
it('labels an active source without a snapshot value as missing',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({snapshot:{snapshot_id:'snap',created_at:'2026-10-02T12:00:00Z'}})})));
 await act(async()=>{tree=create(React.createElement(KeyIndicatorCards,{region:'US',env:{...env,indicators:[{...row('US_DFF'),value_text:null,period_end:null,change:null,sparkline:[]}]}}));});
 expect(JSON.stringify(tree.toJSON())).toContain('states.missing');
 expect(tree.root.findAllByType('mock-detail' as never)).toHaveLength(0);
 expect(tree.root.findAllByType('svg')).toHaveLength(0);
});
it('keeps active snapshot headers visible and never falls back to live history on lookup failure',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({})})));
 await act(async()=>{tree=create(React.createElement(KeyIndicatorCards,{region:'US',env}));});
 expect(JSON.stringify(tree.toJSON())).toContain('keyCards.unavailable');
 expect(JSON.stringify(tree.toJSON())).toContain('4.2');
 expect(tree.root.findAllByType('mock-detail' as never)).toHaveLength(0);
});
it('uses the shared overview snapshot time without a second lookup',async()=>{
 const fetcher=vi.fn(async()=>({ok:false,json:async()=>({})}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>{tree=create(React.createElement(KeyIndicatorCards,{region:'US',env,snapshotTime:{createdAt:'2020-06-15T12:34:56Z',error:false}}));});
 expect(fetcher).not.toHaveBeenCalled();
 expect(tree.root.findAllByType('mock-detail' as never)[0].props.asOf).toBe('2020-06-15T12:34:56Z');
});
