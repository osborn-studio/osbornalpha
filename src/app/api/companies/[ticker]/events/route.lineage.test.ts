import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {LineageRev} from '@/lib/facts/types';
import type {KitDeps} from '@/lib/company/route-test-kit';
import {companyMembers,fakeApplyGate,makeDeps,OLD,seedCompanyHistory,seededTables,seedPinnedCompany,US,memberFilingUrl,REAL_SHA} from '@/lib/company/route-test-kit';
import {applyGate} from '@/lib/company/evidence-gate';
const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
vi.mock('@/lib/company/evidence-gate',async(orig)=>{
 const gate=await orig<typeof import('@/lib/company/evidence-gate')>();
 return {...gate,applyGate:vi.fn(gate.applyGate)};
});
import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/events/route';
import type {EventsDto} from '@/lib/company/handlers/events';
import type {publicConflict} from '@/lib/facts/public-route';
import {eventFactIds} from '@/lib/company/event-dto';
interface Body extends EventsDto{lineage:string[];stateRevs:LineageRev[];conflicts:ReturnType<typeof publicConflict>[];factOwners:Record<string,string>}
const get=(handler=GET,ticker='AAPL',query='')=>handler(new Request(`https://alpha.example/api/companies/${ticker}/events?${query}`),{params:Promise.resolve({ticker})});
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
   for(const query of ['', 'asOf=2024-06-30', 'kinds=period_first_seen&limit=1', 'asOf=2024-06-30&kinds=period_first_seen&limit=1']){
    const res=await get(handler,'AAPL',query);
    expect({status:res.status,cacheControl:res.headers.get('Cache-Control'),body:await res.text()}).toMatchSnapshot(query||'default');
   }
  });
 });
});
const request=async(handler=GET,ticker='AAPL',query=''):Promise<Body>=>{
 const res=await get(handler,ticker,query);expect(res.status).toBe(200);return res.json();
};
describe('merged issuer events',()=>{
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
   expect(res.status).toBe(200);const body:Body=await res.json();expect(body.lineage).toEqual(companyMembers);
   expect(read).toHaveBeenCalledTimes(2);
  }else{
   expect(res.status).toBe(503);expect(await res.json()).toMatchObject({error:{code:'lineage_unstable'}});
   expect(read).toHaveBeenCalledTimes(3);
  }
 });
 function checkEvents(body:Body,rows:Awaited<ReturnType<typeof seedCompanyHistory>>['rows']){
  const ids=body.rows.flatMap(eventFactIds),visible=rows.filter(r=>ids.includes(r.fact_id));
  expect(body.factOwners).toEqual(Object.fromEntries(visible.map(r=>[r.fact_id,r.issuer_id])));
  for(const r of visible)expect(body.evidence[r.fact_id]).toMatchObject({snapshot:{path:`edgar/${r.issuer_id}/${REAL_SHA}.json`},sourceDocument:{url:memberFilingUrl(r)}});
  for(const e of body.rows){
   const r=rows.find(r=>r.filing_id===e.filingId)!;
   expect(e).toMatchObject({issuerId:US,filing:{url:memberFilingUrl(r)}});
  }
  expect(mocks.deps.company.eventsOfIssuer).not.toHaveBeenCalled();
 }
 it.each(modes.flatMap(([mode,h])=>['AAPL','OLDX'].map(ticker=>[mode,ticker,h] as const)))('simple chain (%s %s)',async(_,ticker,h)=>{
  const {rows,stateRevs,read}=await seedCompanyHistory(mocks.deps);
  const body=await request(h,ticker);
  expect(body).toMatchObject({issuerId:US,computed:'live',asOf:null,stateRev:stateRevs.find(r=>r.issuer_id===US)!.state_rev,
   lineage:companyMembers,stateRevs,conflicts:[]});
  const periods=body.rows.filter(e=>e.kind==='period_first_seen');
  expect(periods).toHaveLength(3);
  for(const r of rows)expect(periods).toContainEqual(expect.objectContaining({periodEnd:r.period_end,occurredOn:r.available_date,filingId:r.filing_id,
   payload:expect.objectContaining({headline:{revenue:{value:r.value_text,factId:r.fact_id,unit:r.unit}}})}));
  expect(read).toHaveBeenCalledWith(companyMembers,'US',expect.objectContaining({asOf:'2026-11-09'}));
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(2);
  for(const id of companyMembers)expect(mocks.deps.snapshot).toHaveBeenCalledWith(id,'US',{asOf:'2026-11-09',concepts:['revenue'],history:false,limit:1});
  checkEvents(body,rows);
 });
 it('asOf bounds facts and filings; membership is current',async()=>{
  const {rows,stateRevs}=await seedCompanyHistory(mocks.deps);
  const body=await request(GET,'OLDX','asOf=2023-06-30');
  expect(body).toMatchObject({lineage:companyMembers,stateRevs,asOf:'2023-06-30',computed:'live'});
  for(const kind of ['filing_published','period_first_seen']){
   expect(body.rows.filter(e=>e.kind===kind).map(e=>e.filingId)).toEqual([rows[1].filing_id,rows[0].filing_id]);
  }
  expect(body.rows.every(e=>e.occurredOn<='2023-06-30')).toBe(true);
  expect(body.factOwners).toEqual({[rows[0].fact_id]:OLD,[rows[1].fact_id]:OLD});checkEvents(body,rows);
 });
 it('emits one first disclosure and one cross-owner revision, suppressing same-day disagreement',async()=>{
  const {rows}=await seedCompanyHistory(mocks.deps,'overlap'),body=await request();
  const [old,current,a,b]=rows.slice(2);
  expect(body.conflicts).toEqual([{key:{concept:'revenue',period_start:a.period_start,period_end:a.period_end,consolidation:'consolidated',unit:'USD'},
   availableDate:a.available_date,factIds:[a.fact_id,b.fact_id].sort()}]);
  const period=body.rows.filter(e=>e.kind==='period_first_seen'&&e.periodEnd===old.period_end);
  expect(period).toHaveLength(1);expect(period[0]).toMatchObject({occurredOn:old.available_date,filingId:old.filing_id,
   payload:{headline:{revenue:{factId:current.fact_id,value:'110'}}}});
  const revisions=body.rows.filter(e=>e.kind==='fact_revised');
  expect(revisions).toHaveLength(1);expect(revisions[0]).toMatchObject({occurredOn:current.available_date,filingId:current.filing_id,payload:{
   from:{factId:old.fact_id,value:'100',filingId:old.filing_id},to:{factId:current.fact_id,value:'110',filingId:current.filing_id}}});
  expect(body.factOwners[old.fact_id]).toBe(OLD);expect(body.factOwners[current.fact_id]).toBe(US);
  expect(body.rows.flatMap(eventFactIds)).not.toContain(a.fact_id);expect(body.rows.flatMap(eventFactIds)).not.toContain(b.fact_id);
  checkEvents(body,rows);
 });
 it('keeps predecessor EUR distinct from successor USD in headlines and revision edges',async()=>{
  await seedCompanyHistory(mocks.deps,'units');
  const body=await request(GET,'AAPL','kinds=period_first_seen,fact_revised&limit=1');
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0]).toMatchObject({kind:'period_first_seen',periodEnd:'2023-09-30',payload:{headline:{},ambiguousUnits:['revenue']}});
  expect(body.rows[0].payload.headline).toEqual({});expect(body.factOwners).toEqual({});
 });
 it.each(['','asOf=2023-06-30'])('rejects a truncated lineage replay (%s)',async query=>{
  const {read,stateRevs}=await seedCompanyHistory(mocks.deps);
  read.mockResolvedValue({lineage:companyMembers,stateRevs,conflicts:[],rows:[],truncated:true});
  const res=await get(GET,'AAPL',query);
  expect(res.status).toBe(400);expect(await res.json()).toMatchObject({error:{code:'replay_truncated'}});
  expect(mocks.deps.company.eventsOfIssuer).not.toHaveBeenCalled();
 });
});
