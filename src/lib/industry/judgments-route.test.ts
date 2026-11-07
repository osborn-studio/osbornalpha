import {describe,expect,it,vi} from 'vitest';
const latestCards=vi.fn(async()=>[]);
const listMethodologies=vi.fn(async()=>[]);
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{latestCards,listMethodologies}})}));
import {GET} from '@/app/api/judgments/route';
import {fetchIndustryJudgments} from './judgment-contract';

const key='sw2021:2021:801120.SI';
const request=(query:string)=>new Request(`http://localhost/api/judgments?subject_type=industry&subject_key=${encodeURIComponent(key)}${query}`);
describe('real F4 industry list route parameter matrix',()=>{
 it('latest, as_known and include_abstained return the real empty envelope',async()=>{
  for(const [query,view,asOf,includeAbstained,cutoff] of [
   ['', 'latest',null,false,undefined],
   ['&include_abstained=1','latest',null,true,undefined],
   ['&view=as_known&asOf=2026-11-01&include_abstained=1','as_known','2026-11-01',true,'2026-11-01T23:59:59.999Z'],
   ['&asOf=2026-11-01','as_known','2026-11-01',false,'2026-11-01T23:59:59.999Z'],
  ] as const){
   latestCards.mockClear();
   const response=await GET(request(query));
   expect(response.status).toBe(200);
   expect(await response.json()).toMatchObject({subject:{type:'industry',key},view,asOf,cards:[]});
   expect(latestCards).toHaveBeenCalledWith({type:'industry',key},{types:undefined,view,cutoff});
   expect(includeAbstained).toBe(query.includes('include_abstained=1'));
  }
  expect(await fetchIndustryJudgments(key,{enabled:true,fetch:async()=>(await GET(request('&include_abstained=1'))) as Response})).toEqual({state:'ok',cards:[]});
 });
 it.each([
  ['missing subject_type',`http://localhost/api/judgments?subject_key=${key}`,'subject_type'],
  ['invalid subject_type',`http://localhost/api/judgments?subject_type=security&subject_key=${key}`,'subject_type'],
  ['duplicate subject_type',`http://localhost/api/judgments?subject_type=industry&subject_type=industry&subject_key=${key}`,'subject_type'],
  ['bad subject_key','http://localhost/api/judgments?subject_type=industry&subject_key=bad','subject_key'],
  ['missing subject_key','http://localhost/api/judgments?subject_type=industry','subject_key'],
  ['duplicate subject_key',request(`&subject_key=${key}`).url,'subject_key'],
  ['bad view',request('&view=unknown').url,'view'],
  ['duplicate view',request('&view=latest&view=latest').url,'view'],
  ['as_known missing asOf',request('&view=as_known').url,'asOf'],
  ['latest with asOf',request('&view=latest&asOf=2026-11-01').url,'asOf'],
  ['malformed asOf',request('&asOf=not-a-date').url,'asOf'],
  ['invalid leap day',request('&asOf=2025-02-29').url,'asOf'],
  ['future asOf',request('&asOf=2999-01-01').url,'asOf'],
  ['duplicate asOf',request('&asOf=2026-11-01&asOf=2026-11-01').url,'asOf'],
  ['bad include_abstained',request('&include_abstained=0').url,'include_abstained'],
  ['repeated include_abstained',request('&include_abstained=1&include_abstained=1').url,'include_abstained'],
 ])('%s fails closed',async(_name,url,param)=>{
  latestCards.mockClear();
  const r=await GET(new Request(url));
  expect(r.status).toBe(400);
  expect(await r.json()).toMatchObject({error:{code:`invalid_parameter:${param}`}});
  expect(latestCards).not.toHaveBeenCalled();
 });
});
