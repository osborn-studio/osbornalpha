vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key,useLocale:()=> 'en'}));
import {readFileSync} from 'node:fs';
import {createElement, act} from 'react';
import {create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import zh from '../../../../messages/zh/macroStrategy.json';
import en from '../../../../messages/en/macroStrategy.json';
import type {CycleCell, CycleTableView, ObsRef} from '@/lib/macro/strategy/contract';
import {cycleCell, type Locale, type StrategyT} from './strategy-view-model';
import {cycleNotes, CYCLE_NOTES_VERSION} from './cycle-notes';
import {CycleNotes} from './CycleNotes';
import {ObsRefTable} from './EvidencePairDrawer';

function translator(locale:Locale):StrategyT {
 return (key, values) => {
  const value=key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)?.[k],locale==='zh'?zh:en);
  if(typeof value!=='string')throw new Error(`Missing translation ${key}`);
  return value.replace(/\{(\w+)\}/g,(_,k)=>String(values?.[k]??`{${k}}`));
 };
}
vi.mock('./use-strategy-t',()=>({useStrategyT:()=>({locale:'en',t:translator('en')})}));
const ref=(id:string,date:string):ObsRef=>({observation_id:`${id}:${date}`,series_id:id,period_end:date,value_text:'100',version:1,available_at:`${date}T00:00:00Z`,source:{kind:'history',as_of:'2026-11-01T00:00:00Z'}});
function ok(id:string,kind:'pct'|'bp',raw:number,text:string):CycleCell{return {status:'ok',from:ref(id,'2022-03-16'),to:ref(id,'2023-07-26'),change_kind:kind,change_raw:raw,change_text:text};}
function fixture():CycleTableView{return {
 version:'v',episodes_version:'e',boundary:'event_day',manifest_id:'m',cutoff:'2026-11-01',gaps:[],
 episodes:[{index:7,direction:'hike',start:'2022-03-17',end:'2023-07-27',events:11,upper_from:'0.25',upper_to:'5.5',cumulative_bp:'525',ongoing:true,left_censored:true,gap_after:true}],
 columns:['a','b','c','d','e','f'].map((id,i)=>({id,label:{zh:`列${id}`,en:`Column ${id}`},change_kind:i<3?'pct':'bp',daily_series:id,monthly_series:null,restricted:false})),
 cells:{'7':{a:ok('a','pct',2,'102/100'),b:ok('b','pct',2,'102/100'),c:ok('c','pct',-3,'97/100'),d:ok('d','bp',200,'200.5'),e:ok('e','bp',-40,'-40.5'),f:{status:'restricted'}}}
};}
const sentence=(v:CycleTableView,l:Locale,key:string)=>cycleNotes(v,l,translator(l))[0].sentences.find(s=>s.key===key)!;

describe('cycle notes',()=>{
 beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('HTMLElement',class {});});
 afterEach(()=>vi.unstubAllGlobals());
 it.each(['zh','en'] as const)('uses episode fields, existing flag labels and exact table formatting (%s)',l=>{
  const v=fixture(),t=translator(l),[note]=cycleNotes(v,l,t);
  expect(note.episodeKey).toBe('hike:2022-03-17');expect(note.title).toContain('2023-07-27');
  const span=sentence(v,l,'episode');
  for(const value of ['2022-03-17','2023-07-27','11','+525 bp',t('history.direction.hike'),...['leftCensored','ongoing','gapAfter'].map(k=>t(`history.flag.${k}`))])expect(span.text).toContain(value);
  for(const col of v.columns.slice(0,5)){
   const s=sentence(v,l,`column:${col.id}`),cell=v.cells['7'][col.id];
   expect(s.text).toContain(cycleCell(cell,t).main);expect(s.text).toContain('2022-03-16');expect(s.text).toContain('2023-07-26');
   expect(s.refs).toEqual(cycleCell(cell,t).refs);
  }
  expect(sentence(v,l,'coverage').text).toContain('5 / 6');
 });
 it.each(['out_of_coverage','degenerate','non_positive_base','history_truncated','month_not_closed'] as const)('preserves missing reason %s without a numeric replacement',reason=>{
  const v=fixture();v.cells['7'].a={status:'missing',reason};delete v.cells['7'].b;
  for(const l of ['zh','en'] as const){
   expect(sentence(v,l,'column:a')).toEqual({key:'column:a',text:translator(l)('cycleNotes.missing',{column:v.columns[0].label[l],reason:translator(l)(`history.missing.${reason}`)}),refs:[]});
   expect(sentence(v,l,'column:b').text).toContain(translator(l)('history.missing.out_of_coverage'));
   expect(sentence(v,l,'column:f').text).toContain(translator(l)('state.restricted'));
  }
 });
 it('separates units, resolves ties by column order and cites every compared cell',()=>{
  const v=fixture();
  expect(sentence(v,'en','largestRise:pct').text).toContain('Column a');
  expect(sentence(v,'en','largestFall:pct').text).toContain('Column c');
  expect(sentence(v,'en','largestRise:bp').text).toContain('Column d');
  expect(sentence(v,'en','largestFall:bp').text).toContain('Column e');
  expect(sentence(v,'en','largestRise:pct').refs).toEqual(['a','b','c'].flatMap(id=>cycleCell(v.cells['7'][id],translator('en')).refs));
  v.cells['7'].e={status:'restricted'};
  expect(cycleNotes(v,'en',translator('en'))[0].sentences.some(s=>s.key.endsWith(':bp'))).toBe(false);
 });
 it('does not call a negative maximum a rise or a positive minimum a fall',()=>{
  const v=fixture();v.cells['7'].c=ok('c','pct',1,'101/100');
  expect(cycleNotes(v,'en',translator('en'))[0].sentences.some(s=>s.key==='largestFall:pct')).toBe(false);
  v.cells['7'].d=ok('d','bp',-20,'-20');
  expect(cycleNotes(v,'en',translator('en'))[0].sentences.some(s=>s.key==='largestRise:bp')).toBe(false);
 });
 it('keeps language keys and slots in parity and excludes only cycleNotes.disclaimer from prohibited terms',()=>{
  const blocks=[zh,en].map(m=>(m as unknown as {cycleNotes:Record<string,string>}).cycleNotes);
  expect(blocks[0]).toBeDefined();expect(Object.keys(blocks[0]).sort()).toEqual(Object.keys(blocks[1]).sort());
  const forbidden=/复苏|过热|滞胀|衰退|recovery|overheat|stagflation|recession|概率|probability|预测|forecast|建议|recommend|买入|卖出|buy|sell|因为|导致|because|caused|advice/i;
  for(const [k,value] of Object.entries(blocks[0])){
   expect(value.match(/\{\w+\}/g)?.sort()).toEqual(blocks[1][k].match(/\{\w+\}/g)?.sort());
  }
  for(const block of blocks)for(const [key,value] of Object.entries(block))if(key!=='disclaimer')expect(value).not.toMatch(forbidden);
  for(const l of ['zh','en'] as const){expect(JSON.stringify(cycleNotes(fixture(),l,translator(l)))).not.toMatch(forbidden);}
 });
 it('handles no episodes and leaves input unchanged',()=>{
  const v=fixture(),before=JSON.stringify(v);cycleNotes(v,'zh',translator('zh'));expect(JSON.stringify(v)).toBe(before);
  expect(cycleNotes({...v,episodes:[]},'en',translator('en'))).toEqual([]);
 });
 it('mounts below the table and uses the canonical boundary URL',()=>{
  const screen=readFileSync(new URL('./StrategyScreens.tsx',import.meta.url),'utf8');
  expect(screen).toMatch(/<CycleReturnsTable[\s\S]*<CycleNotes view=\{v\}/);
  expect(screen).toContain("router.replace(macroTabHref('history', region, b), { scroll: false })");
 });
 it('opens only the newest episode and drills sentence evidence in the existing drawer',async()=>{
  const v=fixture();v.episodes.push({...v.episodes[0],index:8,start:'2024-01-01',end:'2024-02-01'});v.cells['8']=v.cells['7'];
  let root!:ReactTestRenderer;
  await act(async()=>{root=create(createElement(CycleNotes,{view:v}));});
  const details=root.root.findAllByType('details');expect(details.map(d=>d.props.open)).toEqual([false,true]);
  expect(JSON.stringify(root.toJSON())).toContain(CYCLE_NOTES_VERSION);
  const button=root.root.findAllByType('button').find(b=>b.children.some(x=>typeof x==='string'&&x.includes('Column a')))!;
  await act(async()=>button.props.onClick());
  expect(root.root.findByProps({role:'dialog'}).props['aria-label']).toContain('Column a');
  expect(root.root.findByType(ObsRefTable).props.refs).toEqual(cycleCell(v.cells['7'].a,translator('en')).refs);
  expect(JSON.stringify(root.toJSON())).toContain('a:2022-03-16');
  await act(async()=>root.unmount());
 });
 it('dismisses evidence from the previous boundary when the table view changes',async()=>{
  const v=fixture();
  let root!:ReactTestRenderer;
  await act(async()=>{root=create(createElement(CycleNotes,{view:v}));});
  const button=root.root.findAllByType('button').find(b=>b.children.some(x=>typeof x==='string'&&x.includes('Column a')))!;
  await act(async()=>button.props.onClick());
  expect(root.root.findAllByProps({role:'dialog'})).toHaveLength(1);
  await act(async()=>root.update(createElement(CycleNotes,{view:{...v,boundary:'month_end'}})));
  expect(root.root.findAllByProps({role:'dialog'})).toHaveLength(0);
  await act(async()=>root.unmount());
 });
});
