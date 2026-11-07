// src/lib/industry/page-data.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./public-deps',()=>({publicReadDeps:vi.fn(),adminReadDeps:vi.fn()}));
vi.mock('../admin/auth',()=>({requireAdminUser:vi.fn()}));
vi.mock('./memberships',()=>({isMemberAt:()=>true}));
vi.mock('./replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));
import {readDepsOf,stubIndustryDb} from './fixture-rows';
import {constituentsQueryFromSearch,detailQueryFromSearch,listQueryFromSearch,loadView} from './page-data';
import type {PageDeps} from './page-data';
import {forgetViews} from './stale-views';
import type {ReadDb} from './read';

const NOW=new Date('2026-11-05T08:00:00.000Z');
const deps=(over:Partial<PageDeps>={}):PageDeps=>({publicDeps:()=>readDepsOf(stubIndustryDb({})),adminDeps:()=>readDepsOf(stubIndustryDb({}),{preview:true}),isAdmin:async()=>false,...over});

const SW={scheme:'sw2021' as const};
describe('loadView',()=>{
 beforeEach(()=>forgetViews());
 it('passes a public view through',async()=>{
  const r=await loadView('k',async()=>({state:'ok',n:1}),{...SW,now:NOW,deps:deps()});
  expect(r).toEqual({view:{state:'ok',n:1},error:null,staleAt:null,preview:false});
 });
 it('unlicensed: non-admins get the unlicensed view, admins the service-role preview',async()=>{
  const build=async(d:{preview:boolean})=>d.preview?{state:'ok' as const}:{state:'unlicensed' as const};
  expect((await loadView('k',build,{...SW,now:NOW,deps:deps()})).view).toEqual({state:'unlicensed'});
  expect(await loadView('k',build,{...SW,now:NOW,deps:deps({isAdmin:async()=>true})})).toEqual({view:{state:'ok'},error:null,staleAt:null,preview:true});
 });
 it('a failed read shows the last good view with its time; nothing remembered → no view',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await loadView('a',async()=>{throw new Error('down');},{...SW,now:NOW,deps:deps()})).toEqual({view:null,error:'read_failed',staleAt:null,preview:false});
  await loadView('a',async()=>({state:'ok',v:'old'}),{...SW,now:NOW,deps:deps()});
  const r=await loadView('a',async()=>{throw new Error('down');},{...SW,now:new Date('2026-11-05T09:00:00.000Z'),deps:deps()});
  expect(r).toEqual({view:{state:'ok',v:'old'},error:'read_failed',staleAt:NOW.toISOString(),preview:false});
  spy.mockRestore();
 });
 it('fails closed after a licence revoke: the licence is re-checked before any stale view is served',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const down=async():Promise<{state:string}>=>{throw new Error('down');};
  await loadView('r',async()=>({state:'ok',v:'licensed numbers'}),{...SW,now:NOW,deps:deps()});
  await loadView('r2',async()=>({state:'ok',v:'other query'}),{...SW,now:NOW,deps:deps()});
  // licence revoked; the next public read fails → the re-check answers false → nothing old is shown, and the dataset is forgotten
  const revoked=deps({publicDeps:()=>readDepsOf(stubIndustryDb({public:new Set()}))});
  expect(await loadView('r',down,{...SW,now:NOW,deps:revoked})).toEqual({view:null,error:'read_failed',staleAt:null,preview:false});
  expect((await loadView('r2',down,{...SW,now:NOW,deps:deps()})).view).toBeNull();   // forgotten with the dataset
  // the licence check itself fails (gate unreachable) → also closed
  await loadView('g',async()=>({state:'ok'}),{...SW,now:NOW,deps:deps()});
  const gateDown=deps({publicDeps:()=>readDepsOf({...stubIndustryDb({}),isDatasetPublic:async()=>{throw new Error('gate down');}} as ReadDb)});
  expect((await loadView('g',down,{...SW,now:NOW,deps:gateDown})).view).toBeNull();
  spy.mockRestore();
 });
 it('stale views expire after 2 hours; forgetViews(datasetKey) drops one dataset only (the licence switch calls it)',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const down=async():Promise<{state:string}>=>{throw new Error('down');};
  await loadView('e',async()=>({state:'ok'}),{...SW,now:NOW,deps:deps()});
  expect((await loadView('e',down,{...SW,now:new Date(NOW.getTime()+2*3_600_000+1),deps:deps()})).view).toBeNull();
  await loadView('s',async()=>({state:'ok',v:'sw'}),{...SW,now:NOW,deps:deps()});
  await loadView('c',async()=>({state:'ok',v:'sic'}),{scheme:'sic',now:NOW,deps:deps()});
  forgetViews('scheme:sw2021:2021');
  expect((await loadView('s',down,{...SW,now:NOW,deps:deps()})).view).toBeNull();
  expect((await loadView('c',down,{scheme:'sic',now:NOW,deps:deps()})).view).toEqual({state:'ok',v:'sic'});
  spy.mockRestore();
 });
 it('an unlicensed answer forgets the last good view (a revoked licence stops serving old numbers)',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  await loadView('b',async()=>({state:'ok'}),{...SW,now:NOW,deps:deps()});
  await loadView('b',async()=>({state:'unlicensed'}),{...SW,now:NOW,deps:deps()});
  expect((await loadView('b',async()=>{throw new Error('down');},{...SW,now:NOW,deps:deps()})).view).toBeNull();
  spy.mockRestore();
 });
});

describe('search params (tolerant: invalid → default)',()=>{
 it('list',()=>{
  expect(listQueryFromSearch({})).toEqual({scheme:'sw2021',version:'2021',level:1,metric:'gross_margin',duration:'12M',periods:10,view:'heatmap'});
  expect(listQueryFromSearch({scheme:'sic',level:'3',view:'table'})).toMatchObject({scheme:'sic',version:'sec-current',level:1,view:'table'});
  expect(listQueryFromSearch({metric:'revenue_sum',duration:'3M',periods:'45'})).toMatchObject({metric:'revenue_sum',duration:'3M',periods:10});
  expect(listQueryFromSearch({metric:'gross_margin',duration:'3M'}).duration).toBe('12M');
 });
 it('detail and constituents',()=>{
  expect(detailQueryFromSearch('sw2021','801120.SI',{metric:'roe',window:'5y'})).toMatchObject({metrics:['roe'],durations:['TTM'],window:'5y',tableOnly:false});
  expect(constituentsQueryFromSearch('sw2021','801120.SI',{on:'2026-12-01',page:'2'},NOW)).toEqual({scheme:'sw2021',version:'2021',code:'801120.SI',on:'2026-11-05',page:2,pageSize:100});
  expect(constituentsQueryFromSearch('sic','3674',{on:'2026-02-30'},NOW).on).toBe('2026-11-05');
  expect(constituentsQueryFromSearch('sic','3674',{on:'2026-06-30'},NOW).on).toBe('2026-06-30');
 });
});
