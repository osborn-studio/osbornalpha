import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {LineageRev} from '@/lib/facts/types';
import type {KitDeps} from '@/lib/company/route-test-kit';
import {companyMembers,fakeApplyGate,makeDeps,OLD,seedCompanyHistory,seededTables,seedPinnedCompany,US} from '@/lib/company/route-test-kit';
import {applyGate} from '@/lib/company/evidence-gate';
const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
vi.mock('@/lib/company/evidence-gate',async(orig)=>{
 const gate=await orig<typeof import('@/lib/company/evidence-gate')>();
 return {...gate,applyGate:vi.fn(gate.applyGate)};
});
import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/packet/route';
import type {PacketDto,PacketInput,PacketValue,PacketSection} from '@/lib/company/handlers/packet';
interface OwnedSection extends PacketSection{IS:{concept:string;unit:string|null;values:Record<string,PacketValue&{issuerId?:string}>}[]}
interface Body extends PacketDto{
 provenance:PacketDto['provenance']&{lineage:string[];stateRevs:LineageRev[];conflicts:number};
 annual:OwnedSection;recent:OwnedSection;
 metrics:(PacketDto['metrics'][number]&{inputs?:(PacketInput&{issuerId?:string})[]})[];
}
const get=(handler=GET,ticker='AAPL',query='')=>handler(new Request(`https://alpha.example/api/companies/${ticker}/packet?${query}`),{params:Promise.resolve({ticker})});
const modes=[['public',GET],['admin',ADMIN_GET]] as const;
beforeEach(async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-09T00:00:01Z'));
 vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});
});
afterEach(()=>vi.useRealTimers());
describe('no lineage: pinned',()=>{
 it.each(modes)('%s',async(_,handler)=>{
  seedPinnedCompany(mocks.deps);
  await vi.mocked(applyGate).withImplementation(fakeApplyGate,async()=>{
   for(const query of ['', 'asOf=2024-06-30']){
    const res=await get(handler,'AAPL',query);
    expect({status:res.status,cacheControl:res.headers.get('Cache-Control'),body:await res.text()}).toMatchSnapshot(query||'default');
   }
  });
 });
});
const request=async(handler=GET,ticker='AAPL',query=''):Promise<Body>=>{
 const res=await get(handler,ticker,query);expect(res.status).toBe(200);return res.json();
};
describe('merged issuer packet',()=>{
 it.each([
  ['membership','changes once'],['membership','keeps changing'],
  ['revision vector','changes once'],['revision vector','keeps changing'],
 ] as const)('retries when the %s %s',async(fence,mode)=>{
  const {db,read}=await seedCompanyHistory(mocks.deps);
  let calls=0;
  const changed=()=>{calls++;return mode==='changes once'?calls===2:calls%2===0;};
  if(fence==='membership')vi.spyOn(db,'lineageOf').mockResolvedValueOnce(companyMembers) // initial dispatch precedes the fenced attempts
   .mockImplementation(async()=>changed()?[US]:companyMembers);
  else{
   const stateRevs=db.stateRevs.bind(db);
   vi.spyOn(db,'stateRevs').mockImplementation(async(ids,market)=>{
    const vector=await stateRevs(ids,market);
    return ids.length>1&&changed()?vector.map(r=>({...r,state_rev:r.state_rev+Number(r.issuer_id===OLD)})):vector;
   });
  }
  const res=await get();
  if(mode==='changes once'){
   expect(res.status).toBe(200);const body:Body=await res.json();expect(body.provenance.lineage).toEqual(companyMembers);
   expect(read).toHaveBeenCalledTimes(2);
  }else{
   expect(res.status).toBe(503);expect(await res.json()).toMatchObject({error:{code:'lineage_unstable'}});
   expect(read).toHaveBeenCalledTimes(3);
  }
 });
 const revenues=(section:OwnedSection)=>Object.values(section.IS.find(r=>r.concept==='revenue')?.values??{});
 it.each(modes.flatMap(([mode,h])=>['AAPL','OLDX'].map(ticker=>[mode,ticker,h] as const)))('simple chain (%s %s)',async(_,ticker,h)=>{
  const {rows,stateRevs,read}=await seedCompanyHistory(mocks.deps);
  const body=await request(h,ticker);
  expect(body).toMatchObject({issuerId:US,provenance:{lineage:companyMembers,stateRevs,conflicts:0}});
  for(const section of [body.annual,body.recent]){
   const values=revenues(section);
   expect(values).toHaveLength(3);
   for(const r of rows)expect(values).toContainEqual({value:r.value_text,factId:r.fact_id,availableDate:r.available_date,...(r.issuer_id===OLD?{issuerId:OLD}:{})});
  }
  const metric=body.metrics.find(m=>m.metric==='revenue_yoy'&&m.periodKey.includes('2023-09-30'));
  expect(metric).toMatchObject({value:'0.25',inputs:expect.arrayContaining([
   {factId:rows[1].fact_id,availableDate:rows[1].available_date,issuerId:OLD},
   {factId:rows[2].fact_id,availableDate:rows[2].available_date}])});
  expect(metric?.inputs).toHaveLength(2);
  expect(read).toHaveBeenCalledWith(companyMembers,'US',expect.objectContaining({asOf:'2026-11-09'}));
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(2);
  for(const id of companyMembers)expect(mocks.deps.snapshot).toHaveBeenCalledWith(id,'US',{asOf:'2026-11-09',concepts:['revenue'],history:false,limit:1});
 });
 it('the packet date bounds facts and filings; membership is current',async()=>{
  const {rows,stateRevs}=await seedCompanyHistory(mocks.deps);
  vi.setSystemTime(new Date('2023-06-30T12:00:00Z'));
  const body=await request(GET,'OLDX');
  expect(body).toMatchObject({asOf:'2023-06-30',provenance:{lineage:companyMembers,stateRevs}});
  for(const section of [body.annual,body.recent]){
   expect(section.periods.map(p=>p.periodEnd)).toEqual(['2022-09-30','2021-09-30']);
   expect(revenues(section)).toEqual(rows.slice(0,2).reverse().map(r=>({value:r.value_text,factId:r.fact_id,availableDate:r.available_date,issuerId:OLD})));
  }
  expect(body.metrics.every(m=>m.availableDate<='2023-06-30'&&!m.factIds.includes(rows[2].fact_id))).toBe(true);
  for(const id of companyMembers)expect(mocks.deps.snapshot).toHaveBeenCalledWith(id,'US',{asOf:'2023-06-30',concepts:['revenue'],history:false,limit:1});
 });
 it('selects one current revision per period and excludes same-day disagreement',async()=>{
  const {rows}=await seedCompanyHistory(mocks.deps,'overlap');
  const body=await request();
  expect(body.provenance.conflicts).toBe(1);
  for(const section of [body.annual,body.recent]){
   expect(section.periods.map(p=>p.periodEnd)).toEqual(['2023-09-30','2022-09-30','2021-09-30']);
   expect(revenues(section).map(v=>'value' in v?v.value:v.withheld)).toEqual(['110','80','50']);
   expect(revenues(section)[0].factId).toBe(rows[3].fact_id);
  }
 });
 it('keeps predecessor EUR out of the USD revenue row',async()=>{
  const {rows}=await seedCompanyHistory(mocks.deps,'units');
  const body=await request();
  for(const section of [body.annual,body.recent]){
   expect(section.IS.find(r=>r.concept==='revenue')?.unit).toBe('USD');
   expect(revenues(section).map(v=>v.factId)).toEqual([rows[2].fact_id,rows[1].fact_id,rows[0].fact_id]);
  }
 });
});
