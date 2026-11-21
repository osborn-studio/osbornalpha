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
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/overview/route';
import type {OverviewDto} from '@/lib/company/handlers/overview';
import type {publicConflict} from '@/lib/facts/public-route';
import {eventFactIds} from '@/lib/company/event-dto';
import {cellFactIds} from '@/lib/company/route';
import type {CoverageRow} from '@/lib/company/types';
interface Body extends OverviewDto{lineage:string[];stateRevs:LineageRev[];conflicts:ReturnType<typeof publicConflict>[];factOwners:Record<string,string>;
 latestFiling:(NonNullable<OverviewDto['latestFiling']>&{issuerId:string;market:string})|null}
const get=(handler=GET,ticker='AAPL',query='')=>handler(new Request(`https://alpha.example/api/companies/${ticker}/overview?${query}`),{params:Promise.resolve({ticker})});
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
describe('merged issuer overview',()=>{
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
   expect(read).toHaveBeenCalledTimes(4);
  }else{
   expect(res.status).toBe(503);expect(await res.json()).toMatchObject({error:{code:'lineage_unstable'}});
   expect(read).toHaveBeenCalledTimes(6);
  }
 });
 const coverage:CoverageRow={issuer_id:US,market:'US',filings_count:1,facts_count:1,concepts_covered:1,
  earliest_period_end:'2023-09-30',latest_period_end:'2023-09-30',latest_available_date:'2023-11-01',
  citation_summary:{linked:0,pending:0,edgar:1},scope_last_success_at:null,scope_last_status:null,based_on_rev:1,
  rebuilt_at:'2023-11-01T00:00:00Z',rebuild_id:'coverage',rebuild_batch_id:'batch'};
 function checkVisible(body:Body,rows:Awaited<ReturnType<typeof seedCompanyHistory>>['rows']){
  const latest=body.latest!;
  const ids=[...Object.values(latest.facts).flatMap(cellFactIds),...Object.values(latest.derived).flatMap(cellFactIds),...body.recentEvents.flatMap(eventFactIds)];
  const visible=rows.filter(r=>ids.includes(r.fact_id));
  expect(body.factOwners).toEqual(Object.fromEntries(visible.map(r=>[r.fact_id,r.issuer_id])));
  for(const r of visible)expect(body.evidence[r.fact_id]).toMatchObject({snapshot:{path:`edgar/${r.issuer_id}/${REAL_SHA}.json`},sourceDocument:{url:memberFilingUrl(r)}});
 }
 it.each(modes.flatMap(([mode,h])=>['AAPL','OLDX'].map(ticker=>[mode,ticker,h] as const)))('simple chain (%s %s)',async(_,ticker,h)=>{
  const {rows,stateRevs,read}=await seedCompanyHistory(mocks.deps);
  vi.mocked(mocks.deps.publicCompany.coverageOf).mockResolvedValue([coverage]);
  const body=await request(h,ticker);
  expect(body).toMatchObject({lineage:companyMembers,stateRevs,conflicts:[],coverage,eventsComputed:'live',
   latestFiling:{filingId:rows[2].filing_id,issuerId:US,market:'US'},latest:{facts:{revenue:{value:'100',factId:rows[2].fact_id}}}});
  expect(mocks.deps.publicCompany.coverageOf).toHaveBeenCalledWith([US]);
  expect(body.recentEvents.some(e=>e.filingId===rows[1].filing_id)).toBe(true);
  expect(body.latest?.derived.revenue_yoy).toMatchObject({kind:'derived',value:'0.25',inputs:expect.arrayContaining([
   expect.objectContaining({factId:rows[1].fact_id,filingId:rows[1].filing_id})])});
  expect(mocks.deps.company.eventsOfIssuer).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledWith(companyMembers,'US',expect.objectContaining({asOf:'2026-11-09'}));
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(2);
  for(const id of companyMembers)expect(mocks.deps.snapshot).toHaveBeenCalledWith(id,'US',{asOf:'2026-11-09',concepts:['revenue'],history:false,limit:1});
  checkVisible(body,rows);
 });
 it('returns the newest lineage filing when the fact envelope is truncated',async()=>{
  const {rows,stateRevs,read}=await seedCompanyHistory(mocks.deps);
  read.mockResolvedValue({lineage:companyMembers,stateRevs,conflicts:[],rows,truncated:true});
  const body=await request(GET,'AAPL','asOf=2023-06-30');
  expect(body.lineage).toEqual(companyMembers);
  expect(body.stateRevs).toEqual(stateRevs);
  expect(body.latest).toEqual({periodKey:null,facts:{},derived:{},truncated:true,stateRev:stateRevs.find(r=>r.issuer_id===US)!.state_rev});
  expect(body.recentEvents).toEqual([]);
  expect(body.evidence).toEqual({});
  expect(body.latestFiling).toMatchObject({filingId:rows[1].filing_id,issuerId:OLD,market:'US'});
 });
 it('asOf bounds facts and filings; membership is current',async()=>{
  const {rows,stateRevs}=await seedCompanyHistory(mocks.deps);
  const body=await request(GET,'OLDX','asOf=2023-06-30');
  expect(body).toMatchObject({lineage:companyMembers,stateRevs,eventsComputed:'live',latestFiling:{filingId:rows[1].filing_id,issuerId:OLD},
   latest:{facts:{revenue:{value:'80',factId:rows[1].fact_id,filingId:rows[1].filing_id}},derived:{revenue_yoy:{kind:'derived',value:'0.6'}}}});
  expect(body.factOwners).toEqual({[rows[0].fact_id]:OLD,[rows[1].fact_id]:OLD});
  expect(body.recentEvents.every(e=>e.occurredOn<='2023-06-30'&&rows.slice(0,2).some(r=>r.filing_id===e.filingId))).toBe(true);
  checkVisible(body,rows);
 });
 it('shows the successor revision and excludes same-day disagreement',async()=>{
  const {rows}=await seedCompanyHistory(mocks.deps,'overlap');
  const body=await request();
  expect(body.latest?.facts.revenue).toMatchObject({value:'110',factId:rows[3].fact_id,isRevision:true});
  expect(body.conflicts).toEqual([{key:{concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-30',consolidation:'consolidated',unit:'USD'},
   availableDate:'2024-12-01',factIds:rows.slice(4).map(r=>r.fact_id).sort()}]);
  const revised=await request(GET,'AAPL','asOf=2024-11-01');
  expect(revised.recentEvents.find(e=>e.kind==='fact_revised')).toMatchObject({payload:{
   from:{factId:rows[2].fact_id,value:'100'},to:{factId:rows[3].fact_id,value:'110'}}});
  checkVisible(revised,rows);
 });
 it('keeps predecessor EUR distinct from successor USD',async()=>{
  await seedCompanyHistory(mocks.deps,'units');
  const body=await request();
  expect(body.latest).toMatchObject({facts:{revenue:null},unavailableReasons:{facts:{revenue:'multiple_units'}}});
 });
});
