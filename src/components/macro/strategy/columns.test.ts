import {act, createElement} from 'react';
import {create, type ReactTestRenderer, type ReactTestInstance} from 'react-test-renderer';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {CycleTableView, PolicyResponseView, TransmissionView} from '@/lib/macro/strategy/contract';
import {MACRO_CATALOG} from '@/lib/macro/catalog';
import {cycleScale, edgeNotes, visibleColumns, visibleDims} from './strategy-view-model';
import {CycleReturnsTable} from './CycleReturnsTable';
import {PolicyResponseMatrix} from './PolicyResponseMatrix';
import {PLAYBOOK_DISCLAIMER_V1} from '@/lib/macro/strategy/data/playbooks-v1';
import {PlaybookGrid} from './PlaybookGrid';
import {TransmissionFlow} from './TransmissionFlow';
import {MacroWorkbench} from '../MacroWorkbench';
const i18n = vi.hoisted(() => ({locale:'zh'}));
vi.mock('next-intl', () => ({useLocale:()=>i18n.locale,useTranslations:()=> (key:string, values?:Record<string,unknown>) => key + (values ? JSON.stringify(values) : '')}));
vi.mock('next/link',()=>({default:({children,...props}:{children:import('react').ReactNode;href:string})=>createElement('a',props,children)}));
vi.mock('../use-macro-overview',()=>({useMacroOverview:()=>({status:'loading'})}));
const label={zh:'短标签',en:'Short label'};
const cycle:CycleTableView={version:'v',episodes_version:'v',boundary:'event_day',manifest_id:'m',cutoff:'c',episodes:[{index:0,direction:'hike',start:'2025-01-01',end:'2025-02-01',events:1,upper_from:'1',upper_to:'2',cumulative_bp:'100',left_censored:false,ongoing:false,gap_after:false}],cells:{},gaps:[],columns:[
 {id:'available',label,change_kind:'pct',daily_series:'daily',monthly_series:null,restricted:false},
 {id:'restricted',label,change_kind:'pct',daily_series:null,monthly_series:null,restricted:true},
 {id:'absent',label,change_kind:'pct',daily_series:null,monthly_series:null,restricted:false},
]};
const matrix:PolicyResponseView={version:'v',window:3,manifest_id:'m',cutoff:'c',rows:[],sentences:[],dims:[
 {id:'available',label,unit:'pct',kind:'series',coverage:{from:null,to:null}},
 {id:'restricted',label,unit:'pct',kind:'restricted',coverage:{from:null,to:null}},
 {id:'absent',label,unit:'pct',kind:'not_in_catalog',coverage:{from:null,to:null}},
]};
const flow:TransmissionView={version:'v',region:'US',manifest_id:'m',cutoff:'c',catalog_version:'v',snapshots:{US:null,CN:null},stages:[
 {stage:'rates',label,nodes:[{id:'n',state:'derived',label,value_text:'2.25',unit:'pp',period_end:'2026-10-31',reason:{zh:'原因',en:'Reason'},inputs:[]}],edge:{kind:'assumption',text:{zh:'机制假设：利率传导',en:'Mechanism assumption: rates'}}},
 {stage:'assets',label,nodes:[],edge:null},
]};
let root:ReactTestRenderer|undefined;
let stored:string|null;
const storage={getItem:vi.fn(()=>stored),setItem:vi.fn((_key:string,value:string)=>{stored=value;})};
beforeEach(()=>{i18n.locale='zh';stored=null;storage.getItem.mockClear();storage.setItem.mockClear();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('window',{localStorage:storage});});
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;vi.unstubAllGlobals();});
function renderedText(node:ReactTestInstance):string{return node.children.map(c=>typeof c==='string'?c:renderedText(c)).join('');}
async function mount(element:ReturnType<typeof createElement>){await act(async()=>{root=create(element);});return root!;}
it('filters only structurally unavailable columns and dimensions, preserving DTO labels and scale',()=>{
 const before=structuredClone(cycle);
 const expected=[{id:'available',label,hidden_reason:null},{id:'restricted',label,hidden_reason:'restricted'},{id:'absent',label,hidden_reason:'not_in_catalog'}];
 expect(visibleColumns(cycle,'all')).toEqual(expected);
 expect(visibleDims(matrix,'all')).toEqual(expected);
 expect(visibleColumns(cycle,'available')).toEqual([expected[0]]);
 expect(visibleDims(matrix,'available')).toEqual([expected[0]]);
 expect(cycle).toEqual(before);
 expect(cycleScale(cycle,'available')).toBe(cycleScale(before,'available'));
});
it('keeps nonzero cycle scales unchanged across both visibility modes',()=>{
 const episode={index:0,direction:'hike' as const,start:'2025-01-01',end:'2025-02-01',events:1,upper_from:'1',upper_to:'2',cumulative_bp:'100',left_censored:false,ongoing:false,gap_after:false};
 const ref={observation_id:'o',series_id:'daily',period_end:'2025-01-01',value_text:'1',version:1,available_at:'2025-01-01',source:{kind:'history' as const,as_of:'2025-02-01'}};
 const view:CycleTableView={...cycle,episodes:[episode],cells:{'0':{available:{status:'ok',from:ref,to:ref,change_raw:12.5,change_text:'1.125/1',change_kind:'pct'}}}};
 for(const mode of ['available','all'] as const){visibleColumns(view,mode);expect(cycleScale(view,'available')).toBe(12.5);}
});
for(const kind of ['cycle','matrix'] as const){
 it(`${kind} toggles all rendered columns, persists and restores the preference`,async()=>{
  const element=kind==='cycle'?createElement(CycleReturnsTable,{view:cycle,boundary:'event_day',onBoundary:vi.fn()}):createElement(PolicyResponseMatrix,{view:matrix,window:3,onWindow:vi.fn()});
  const r=await mount(element);
  const pill=(mode:string)=>r.root.findAllByType('button').find(b=>b.children.join('')===`columns.${mode}`)!;
  expect(pill('available').props['aria-pressed']).toBe(true);
  expect(JSON.stringify(r.toJSON())).toContain('columns.hidden{\\"n\\":2}');
  expect(r.root.findByProps({href:'/macro?tab=methodology#data-gaps'})).toBeDefined();
  expect(JSON.stringify(r.toJSON())).not.toContain('states.withheld');
  expect(r.root.findAllByType('thead')[0].findAllByType('th')).toHaveLength(2);
  expect(r.root.findAllByType('section')).toHaveLength(1);
  if(kind==='cycle')expect(r.root.findAllByType('rect')).toHaveLength(0);
  await act(async()=>pill('all').props.onClick());
  expect(pill('all').props['aria-pressed']).toBe(true);
  expect(r.root.findAllByType('thead')[0].findAllByType('th')).toHaveLength(4);
  expect(r.root.findAllByType('section')).toHaveLength(3);
  expect(storage.setItem).toHaveBeenCalledWith('macro.strategy.columns.v1','all');
  expect(JSON.stringify(r.toJSON())).not.toContain('columns.hidden');
  await act(async()=>r.unmount());root=undefined;
  const restored=await mount(element);
  expect(restored.root.findAllByType('button').find(b=>b.children.join('')==='columns.all')!.props['aria-pressed']).toBe(true);
 });
 it(`${kind} tolerates blocked storage and rejects invalid preferences`,async()=>{
  stored='invalid';
  storage.getItem.mockImplementationOnce(()=>{throw new Error('blocked');});
  storage.setItem.mockImplementationOnce(()=>{throw new Error('blocked');});
  const r=await mount(kind==='cycle'?createElement(CycleReturnsTable,{view:cycle,boundary:'event_day',onBoundary:vi.fn()}):createElement(PolicyResponseMatrix,{view:matrix,window:3,onWindow:vi.fn()}));
  const all=r.root.findAllByType('button').find(b=>b.children.join('')==='columns.all')!;
  await act(async()=>all.props.onClick());
  expect(all.props['aria-pressed']).toBe(true);
 });
}
it('renders only arrows within the flow and localized edge text once in closed details',async()=>{
 expect(edgeNotes(flow,'zh')).toEqual(['机制假设：利率传导']);
 expect(edgeNotes(flow,'en')).toEqual(['Mechanism assumption: rates']);
 for(const locale of ['zh','en']){
  i18n.locale=locale;
  const r=await mount(createElement(TransmissionFlow,{view:flow}));
  const ol=r.root.findByType('ol');
  expect(renderedText(ol)).not.toContain('机制假设：');
  const details=r.root.findAllByType('details');
  expect(details.length).toBe(2);
  expect(details.every(d=>!d.props.open)).toBe(true);
  expect(details[0].findAllByType('summary')[0].children).toEqual(['flow.details']);
  expect(details[0].children.some(c=>typeof c!=='string'&&c.type==='div'&&c.children.includes(locale==='zh'?'原因':'Reason'))).toBe(true);
  expect(JSON.stringify(r.toJSON()).split(edgeNotes(flow,locale as 'zh'|'en')[0])).toHaveLength(2);
  await act(async()=>r.unmount());root=undefined;
 }
});
it('methodology links to a catalog-driven gap section even without a snapshot',async()=>{
 const r=await mount(createElement(MacroWorkbench,{initialRegion:'US',initialTab:'methodology',judgmentsEnabled:false,options:{indicators:[],assets:[]}}));
 const section=r.root.findByProps({id:'data-gaps'});
 const text=renderedText(section);
 for(const entry of MACRO_CATALOG.filter(d=>d.status==='restricted'||d.status==='missing')){
  expect(text).toContain(entry.name.zh);expect(text).toContain(entry.reason!.zh);
 }
 expect(readFileSync('src/components/macro/MacroWorkbench.tsx','utf8')).toContain('data-gaps');
});

it('renders the playbook declaration once for the entire library',async()=>{
 const playbooks=(['recovery','overheat'] as const).map(regime=>({regime,title:label,triggers:[],mechanism:[],implications:{favored:[],disfavored:[]},watch:[]}));
 const r=await mount(createElement(PlaybookGrid,{playbooks,judgment:{status:'disabled'}}));
 expect(renderedText(r.root).split(PLAYBOOK_DISCLAIMER_V1.zh)).toHaveLength(2);
});

for(const kind of ['cycle','matrix'] as const){
 it(`${kind} labels unavailable catalog columns on desktop and mobile even without cell data`,async()=>{
  stored='all';
  const r=await mount(kind==='cycle'?createElement(CycleReturnsTable,{view:cycle,boundary:'event_day',onBoundary:vi.fn()}):createElement(PolicyResponseMatrix,{view:matrix,window:3,onWindow:vi.fn()}));
  const headers=r.root.findAllByType('thead')[0];
  expect(renderedText(headers)).toContain('states.withheld');
  expect(renderedText(headers)).toContain('states.notServed');
  const headings=r.root.findAllByType('section').map(s=>renderedText(s.findByType('h3')));
  expect(headings[1]).toContain('states.withheld');
  expect(headings[2]).toContain('states.notServed');
 });
}
it('links observed transmission nodes to the existing macro series route',async()=>{
 const observed:TransmissionView={...flow,stages:[{...flow.stages[0],nodes:[{...flow.stages[0].nodes[0],state:'observed',inputs:[{observation_id:'o',series_id:'US_DFF',period_end:'2026-10-31',value_text:'2.25',version:1,available_at:'2026-11-01',source:{kind:'history',as_of:'2026-11-01'}}]}]}]};
 const r=await mount(createElement(TransmissionFlow,{view:observed}));
 expect(r.root.findByProps({href:'/macro/US_DFF'})).toBeDefined();
});
it('suppresses a restricted node value even if an inconsistent DTO carries a number',async()=>{
 const restricted={...flow,stages:[{...flow.stages[0],nodes:[{...flow.stages[0].nodes[0],state:'restricted' as const,value_text:'987654.32',inputs:[]}]}]};
 const r=await mount(createElement(TransmissionFlow,{view:restricted}));
 expect(renderedText(r.root)).not.toContain('987654.32');
 expect(r.root.findAllByProps({'data-research-state':'withheld'}).length).toBeGreaterThan(0);
});
it('uses unified missing cells in cycle and matrix values as well as their column labels',async()=>{
 const r=await mount(createElement(CycleReturnsTable,{view:cycle,boundary:'event_day',onBoundary:()=>{}}));
 expect(r.root.findAllByProps({'data-research-state':'missing'}).length).toBeGreaterThan(0);
});
it('reports only the registry series in the visible matrix dimensions to the page footer',async()=>{
 const onSeriesShown=vi.fn();
 const view={...matrix,dims:[{...matrix.dims[0],series:'US_DFF'},{...matrix.dims[1],series:'US_WALCL'}]};
 const r=await mount(createElement(PolicyResponseMatrix,{view,window:3,onWindow:()=>{},onSeriesShown}));
 expect(onSeriesShown).toHaveBeenLastCalledWith(['US_DFF']);
 const all=r.root.findAllByType('button').find(b=>renderedText(b)==='columns.all')!;
 await act(async()=>all.props.onClick());
 expect(onSeriesShown).toHaveBeenLastCalledWith(['US_DFF','US_WALCL']);
});
