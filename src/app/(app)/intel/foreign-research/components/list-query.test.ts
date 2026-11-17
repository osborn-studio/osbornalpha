// URL filter and four-state list behavior (spec §9.2).
import {describe,expect,it} from 'vitest';
import {apiQuery,classifyListResponse,filtersToParams,isFiltered,parseListFilters} from './list-query';
const res=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
describe('list query',()=>{
 it('round trips and trims filters',()=>{
  const f=parseListFilters(new URLSearchParams('ticker=%20AAPL%20&rating=buy&summary=1&junk=1'));
  expect(f).toEqual({ticker:' AAPL ',institution:'',rating:'buy',from:'',to:'',summary:true});
  expect(filtersToParams(f).toString()).toBe('ticker=AAPL&rating=buy&summary=1');
  expect(apiQuery(f,'CUR',50)).toBe('ticker=AAPL&rating=buy&summary=1&limit=50&cursor=CUR');
  expect(isFiltered(parseListFilters(new URLSearchParams('')))).toBe(false);
 });
 it('classifies empty, no results, error and paging',async()=>{
  expect(await classifyListResponse(res(404,{error:{code:'not_found'}}),false,false)).toEqual({kind:'empty'});
  expect(await classifyListResponse(res(404,{error:{code:'unknown_ticker'}}),true,false)).toEqual({kind:'noResults',unknownTicker:true});
  expect(await classifyListResponse(res(200,{reports:[],nextCursor:null,count:0}),true,false)).toEqual({kind:'noResults',unknownTicker:false});
  expect((await classifyListResponse(res(200,{reports:[],nextCursor:null,count:0}),false,true)).kind).toBe('ok');
  expect(await classifyListResponse(res(500,{}),false,false)).toEqual({kind:'error'});
  expect(await classifyListResponse(res(200,{nope:1}),false,false)).toEqual({kind:'error'});
 });
});
