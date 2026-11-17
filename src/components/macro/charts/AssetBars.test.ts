import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {createElement} from 'react';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {AssetBars} from './AssetBars';
import zh from '../../../../messages/zh/macro.json';
import en from '../../../../messages/en/macro.json';
import type {AssetByCycle} from '@/lib/macro/series-extras';
import type {Cycle} from '@/lib/macro/cycles';

beforeAll(()=>vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true));
afterAll(()=>vi.unstubAllGlobals());
const cycles:Cycle[]=[{start:'2024-01-01',end:'2024-12-31',basis:'trailing_median',direction:'up',ongoing:false,confirmed_at:'2024-06-30',event_count:null,version:'v'}];
const assets:AssetByCycle[]=['2','-3',null,'0'].map((change_text,i)=>({asset_id:`a${i}`,asset_name:{zh:`资产${i}`,en:`Asset ${i}`},cycle_index:0,change_kind:i===1?'bp':'pct',change_text,start_period:'2023-12-31',end_period:'2024-12-31',start_value:null,end_value:null,missing:change_text===null?'both':null,observation_ids:[]}));
const t=(key:string,values?:Record<string,string|number>)=>{
 const message=key.startsWith('assetBars.')?zh.assetBars[key.slice(10) as keyof typeof zh.assetBars]:key;
 return message.replace(/\{(\w+)\}/g,(_,name:string)=>String(values?.[name]??name));
};
describe('asset bars',()=>{
 it('keeps the bars messages in step for both locales',()=>{
  expect(Object.keys(zh.assetBars)).toEqual(Object.keys(en.assetBars));
  expect(zh.assetBars).toHaveProperty('endpoints');
 });
 it('shows separate unit panels, centred signed bars, endpoint titles and missing without a bar',async()=>{
  let r!:ReactTestRenderer;
  await act(async()=>{r=create(createElement(AssetBars,{assets,cycles,locale:'zh',t,table:createElement('table',{'aria-label':'original table'})}));});
  const svg=r.root.findAllByType('svg');
  expect(svg).toHaveLength(3);
  expect(svg[0].findByType('line').props.x1).toBe(50);
  expect(svg[0].findByType('rect').props.fill).toBe('var(--up)');
  expect(svg[1].findAllByType('rect')).toHaveLength(0);
  expect(svg[2].findByType('rect').props.fill).toBe('var(--down)');
  expect(r.root.findAllByProps({title:'% · 周期 2024-01-01 → 2024-12-31 · 观测 2023-12-31 → 2024-12-31'}).length).toBeGreaterThan(0);
  expect(JSON.stringify(r.toJSON())).toContain('缺失');
  expect(r.root.findAllByType('table')).toHaveLength(0);
  const buttons=r.root.findAllByType('button');
  await act(async()=>{buttons[1].props.onClick();});
  expect(r.root.findByType('table').props['aria-label']).toBe('original table');
  expect(r.root.findAllByType('svg')).toHaveLength(0);
  await act(async()=>{buttons[0].props.onClick();});
  expect(r.root.findAllByType('svg')).toHaveLength(3);
  await act(async()=>r.unmount());
 });
});
