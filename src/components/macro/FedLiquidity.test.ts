import React,{act} from 'react';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {FedLiquidity} from './FedLiquidity';
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k}));
vi.mock('./use-macro-t',()=>({useMacroT:()=>({locale:'en',t:(k:string)=>k})}));
vi.mock('./SourceDrawer',()=>({SourceDrawer:(p:object)=>React.createElement('mock-drawer',p)}));
vi.mock('./charts/MacroLineChart',()=>({MacroLineChart:(p:object)=>React.createElement('mock-chart',p)}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let tree:ReactTestRenderer;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());vi.unstubAllGlobals();});
it('loads the three registry series and shows missing reasons without zero or empty axes before sync',async()=>{
 const fetcher=vi.fn(async(_url:string)=>({ok:true,json:async()=>({observations:[]})}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'US',createdAt:'2020-06-15T12:34:56Z'}));});
 expect(fetcher.mock.calls).toHaveLength(3);
 expect(fetcher.mock.calls.map(c=>String(c[0]).split('?')[0])).toEqual(['/api/macro/series/US_WALCL','/api/macro/series/US_RRPONTSYD','/api/macro/series/US_WTREGEN']);
 expect(tree.root.findAllByProps({'data-research-state':'missing'})).toHaveLength(3);
 expect(tree.root.findAllByType('mock-chart' as never)).toHaveLength(0);
 expect(JSON.stringify(tree.toJSON())).toContain('liquidity.missing');
 expect(tree.root.findAllByProps({'data-mark':'fact'})).toHaveLength(1);
});
it('renders API values, units, periods, accessible history tables and evidence openers',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({observations:[{observation_id:'obs',period_end:'2026-10-31',value_text:'123.45',available_at:'2026-11-01',version:1}]})})));
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'US',createdAt:'2020-06-15T12:34:56Z'}));});
 expect(tree.root.findAllByType('table')).toHaveLength(3);
 expect(tree.root.findAllByType('mock-chart' as never)).toHaveLength(3);
 expect(JSON.stringify(tree.toJSON())).toContain('123.45');expect(JSON.stringify(tree.toJSON())).toContain('2026-10-31');
 await act(async()=>{tree.root.findAllByProps({'data-source-value':'US_WALCL'})[0].props.onClick();});
 expect(tree.root.findByType('mock-drawer' as never).props.target).toMatchObject({seriesId:'US_WALCL',observationId:'obs',periodEnd:'2026-10-31'});
});
it('renders and fetches nothing for CN',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'CN'}));});
 expect(tree.toJSON()).toBeNull();expect(fetcher).not.toHaveBeenCalled();
});

it('pins every fetch to the snapshot instant and date, and refetches on snapshot change',async()=>{
 const fetcher=vi.fn(async(_url:string)=>({ok:true,json:async()=>({observations:[]})}));vi.stubGlobal('fetch',fetcher);
 const first='2020-06-15T12:34:56Z';
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'US',createdAt:first}));});
 expect(fetcher).toHaveBeenCalledTimes(3);
 for(const [url] of fetcher.mock.calls){
  const q=new URL(url,'http://localhost').searchParams;
  expect(q.get('asOf')).toBe(first);expect(q.get('to')).toBe('2020-06-15');expect(q.get('from')).toBe('2015-06-15');
 }
 const next='2021-07-16T01:02:03Z';
 await act(async()=>{tree.update(React.createElement(FedLiquidity,{region:'US',createdAt:next}));});
 expect(fetcher).toHaveBeenCalledTimes(6);
 for(const [url] of fetcher.mock.calls.slice(3)){
  const q=new URL(url,'http://localhost').searchParams;
  expect(q.get('asOf')).toBe(next);expect(q.get('to')).toBe('2021-07-16');
 }
});
it('does not fetch without snapshot time and shows the missing reason',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'US'}));});
 expect(fetcher).not.toHaveBeenCalled();
 expect(tree.root.findAllByProps({'data-research-state':'missing'})).toHaveLength(3);
 expect(JSON.stringify(tree.toJSON())).toContain('keyCards.unavailable');
});
it('hides old values immediately when snapshot time becomes unavailable',async()=>{
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({observations:[{observation_id:'obs',period_end:'2020-06-01',value_text:'123.45'}]})}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'US',createdAt:'2020-06-15T12:34:56Z'}));});
 expect(JSON.stringify(tree.toJSON())).toContain('123.45');
 await act(async()=>{tree.update(React.createElement(FedLiquidity,{region:'US',createdAt:null}));});
 expect(fetcher).toHaveBeenCalledTimes(3);
 expect(JSON.stringify(tree.toJSON())).not.toContain('123.45');
 expect(JSON.stringify(tree.toJSON())).toContain('keyCards.unavailable');
});

it('keeps the evidence drawer outside the fact card',async()=>{
 await act(async()=>{tree=create(React.createElement(FedLiquidity,{region:'US'}));});
 expect(tree.root.findByProps({'data-mark':'fact'}).findAllByType('mock-drawer' as never)).toHaveLength(0);
 expect(tree.root.findAllByType('mock-drawer' as never)).toHaveLength(1);
});
