import {describe,expect,it} from 'vitest';
import {citationParts,displayName,qStateOf,queryKeyOf,viewOf} from './directory-view';

describe('directory view helpers',()=>{
 it('qStateOf: empty / valid / invalid (trimmed)',()=>{
  expect(qStateOf('  ')).toBe('empty');expect(qStateOf(' 贵州 ')).toBe('valid');
  for(const bad of ['a,b','a*','x'.repeat(25)])expect(qStateOf(bad)).toBe('invalid');
 });
 it('a filter or page change followed by a rejected request never shows the old rows or enables old pagination',()=>{
  const k1=queryKeyOf({q:'',market:'all',sort:'name',page:1});
  const ok={key:k1,seq:1,data:{total:250,rows:['a']}};
  expect(viewOf(k1,ok,null)).toEqual({status:'ready',data:ok.data});
  const k2=queryKeyOf({q:'',market:'all',sort:'name',page:2});   // page change, request pending
  expect(viewOf(k2,ok,null)).toEqual({status:'loading'});
  expect(viewOf(k2,ok,{key:k2,seq:2,code:'internal'})).toEqual({status:'error',code:'internal'});   // rejected: still no rows
  const k3=queryKeyOf({q:'aap',market:'US',sort:'name',page:1});   // filter change, previous error is for another key
  expect(viewOf(k3,ok,{key:k2,seq:2,code:'internal'})).toEqual({status:'loading'});
  expect(viewOf(k1,ok,{key:k2,seq:2,code:'internal'}).status).toBe('ready');   // back to the successful key
 });
 it('A → B → back to A where A fails: the newer failure wins over the cached success; a later retry success wins again',()=>{
  const kA=queryKeyOf({q:'',market:'all',sort:'name',page:1}),kB=queryKeyOf({q:'x',market:'all',sort:'name',page:1});
  const okA={key:kA,seq:1,data:'A'};
  expect(viewOf(kB,okA,null)).toEqual({status:'loading'});
  expect(viewOf(kA,okA,{key:kA,seq:3,code:'internal'})).toEqual({status:'error',code:'internal'});
  expect(viewOf(kA,{key:kA,seq:4,data:'A2'},{key:kA,seq:3,code:'internal'})).toEqual({status:'ready',data:'A2'});
 });
 it('displayName follows the sort key under sort=name, else the locale',()=>{
  const r={names:{zh:'贵州茅台',en:'Kweichow Moutai'},primaryTicker:'600519.SH',issuerId:'x'};
  expect(displayName(r,'zh','latest_available_date')).toBe('贵州茅台');
  expect(displayName(r,'en','latest_available_date')).toBe('Kweichow Moutai');
  expect(displayName(r,'zh','name')).toBe('Kweichow Moutai');
  expect(displayName({...r,names:{zh:'甲',en:null}},'en','name')).toBe('甲');
  expect(displayName({...r,names:{zh:null,en:null}},'zh','name')).toBe('600519.SH');
 });
 it('citationParts per market',()=>{
  const c={linked:9,pending:1,edgar:0};
  expect(citationParts('CN',c).map(x=>x.key)).toEqual(['linked','pending']);
  expect(citationParts('US',{...c,edgar:10})).toEqual([{key:'edgar',n:10}]);
 });
});
