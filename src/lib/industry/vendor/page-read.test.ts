import {expect,it,vi} from 'vitest';
import {recordAttempt} from '../../dq/freshness';
import {FRESHNESS} from './types';
import {memoryTableClient} from '../../db/memory-table-client';
import {memoryVendorRawStore} from '../../vendor/raw-store';
import {cnListView,cnDetailView,cnConstituentsView} from './page-read';
import {memoryVendorIndustryDb} from './db';
import {runGildataFinancials,runGildataMemberships} from './ingest';
import {fixtureDirSource} from './fixtures-dir';
import {SW2021_L1_GILDATA} from './sw2021-gildata-codes';
const code='801080.SI',list={metric:'revenue_yoy',basis:'annual',periods:1} as const;
const detail={code,metric:'revenue_yoy',basis:'annual',window:'5y'} as const;
const now=new Date('2026-11-24Z');
async function setup(admin=true){
 const tables=memoryTableClient();
 for(const dataset_key of ['scheme:sw2021:2021','vendor:gildata:industry-financials'])
  await tables.insert('industry_dataset_licenses',{dataset_key,status:'internal'});
 return {tables,db:memoryVendorIndustryDb(),now,isSignedIn:async()=>true,isAdmin:async()=>admin};
}
it('withholds every view without reading any vendor data, even for unknown codes',async()=>{
 const deps=await setup(false);
 const select=vi.spyOn(deps.tables,'select');
 deps.db=new Proxy(deps.db,{get(){throw Error('vendor read');}});
 for(const result of await Promise.all([cnListView(deps,list),cnDetailView(deps,{...detail,code:'unknown'}),cnConstituentsView(deps,{code})]))
  expect(result).toEqual({state:'withheld'});
 expect(select.mock.calls.some(([table])=>table==='dq_freshness')).toBe(false);
 expect(await cnDetailView({...deps,isAdmin:async()=>true},{...detail,code:'unknown'})).toEqual({state:'unknown_industry'});
});
it('returns empty for an absent active run',async()=>{
 const deps=await setup();
 for(const result of await Promise.all([cnListView(deps,list),cnDetailView(deps,detail),cnConstituentsView(deps,{code})]))
  expect(result).toEqual({state:'empty',licence:'internal'});
});
it('reads fixture cells with both input sources and a single evidence batch per view',async()=>{
 const deps=await setup();
 const ingest={...deps,now:()=>now,source:fixtureDirSource('src/lib/vendor/gildata/fixtures'),codeVersion:'test',
  raw:memoryVendorRawStore(),universe:SW2021_L1_GILDATA.filter(r=>r.indexCode===code)};
 const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
 expect((await runGildataFinancials(ingest,opts)).status).toBe('success');
 for(const day of [25,26]){
  await recordAttempt(deps.tables,FRESHNESS.financials,{ok:false,cadence:'weekly',now:new Date(Date.UTC(2026,10,day))});
 }
 deps.now=new Date('2026-11-26Z');
 const lookup=vi.spyOn(deps.db,'retrievalsByIds');
 const result=await cnListView(deps,list);
 expect(result).toMatchObject({state:'ok',periodEnds:['2025-12-31'],nodes:[{code,nameEn:'Electronics',members:{source:{vendor:'gildata'}}}],
  freshness:{financials:{status:'error',lastOkAt:now.toISOString()},memberships:{status:'missing',lastOkAt:null}},cells:[{metric:'revenue_yoy',status:'ok',source:null,
   derived:{formula:'yoy/1',memberSetChanged:true,memberCounts:{previous:expect.any(String),current:expect.any(String)},inputs:[{periodEnd:'2025-12-31',source:{vendor:'gildata'}},{periodEnd:'2024-12-31',source:{vendor:'gildata'}}]}}]});
 expect(lookup).toHaveBeenCalledTimes(1);
 expect(await cnDetailView(deps,detail)).toMatchObject({constituents:null,series:[{missingReason:'no_prior_period'},{status:'ok'}]});
 expect((await runGildataMemberships(ingest,opts)).status).toBe('success');
 await deps.tables.update('industry_dataset_licenses',{status:'internal'},{status:'public'});
 deps.isAdmin=async()=>false;
 expect(await cnListView(deps,list)).toMatchObject({state:'ok',header:{licence:'public'}});
 lookup.mockClear();
 const d=await cnDetailView(deps,detail);
 if(d.state!=='ok')throw Error(d.state);
 expect([d.header.licence,d.constituents?.header.licence]).toEqual(['public','public']);
 expect(d.latest).toHaveLength(7);expect(d.constituents?.preview).toHaveLength(5);expect(lookup).toHaveBeenCalledTimes(1);
 const p=await cnConstituentsView(deps,{code,page:2,pageSize:2});
 expect(p).toMatchObject({state:'ok',page:2,total:6,rows:d.constituents?.preview.slice(2,4)});
 expect(lookup).toHaveBeenCalledTimes(2);
 const annual=await deps.db.activeRun('financials');
 if(!annual)throw Error('expected financials');
 const dates=Array.from({length:14},(_,i)=>['03-31','06-30','09-30','12-31'].map(md=>String(2012+i)+'-'+md)).flat();
 const active=deps.db.activeRun.bind(deps.db);
 vi.spyOn(deps.db,'activeRun').mockImplementation(kind=>kind==='financials'?Promise.resolve({...annual,expected_grid:{...annual.expected_grid,period_ends:dates}}):active(kind));
 for(const [periods,length] of [[undefined,10],[20,12]] as const){
  const l=await cnListView(deps,{metric:'roe_avg',basis:'annual',periods});
  if(l.state!=='ok')throw Error(l.state);
  expect(l.cells).toHaveLength(length);expect(l.periodEnds.every(end=>end.endsWith('-12-31'))).toBe(true);
  expect(l.cells[0]).toMatchObject({status:'missing',valueText:null,missingReason:'not_in_run'});
 }
 const history=await cnDetailView(deps,detail);
 if(history.state!=='ok')throw Error(history.state);
 expect(history.series.find(c=>c.periodEnd==='2024-12-31')).toMatchObject({
  missingReason:'not_in_run',derived:{inputs:[{status:'ok'},{periodEnd:'2023-12-31',missingReason:'not_in_run'}]},
 });
 const quarter=await cnDetailView(deps,{...detail,basis:'quarter',metric:'gross_margin'});
 if(quarter.state!=='ok')throw Error(quarter.state);
 expect(quarter.series).toHaveLength(20);expect(quarter.series[0].periodEnd).toBe('2021-03-31');
 expect(await cnConstituentsView(deps,{code,page:500,pageSize:2})).toMatchObject({page:3,rows:expect.any(Array)});
 const capped=await cnConstituentsView(deps,{code,pageSize:500});
 expect(capped).toMatchObject({page:1,pageSize:200,total:6});
 lookup.mockResolvedValue([]);
 await expect(cnListView(deps,list)).rejects.toThrow('retrieval_unavailable');
});
it('checks unknown constituents codes after access and before reading either run',async()=>{
 const deps=await setup();
 const activeRun=vi.spyOn(deps.db,'activeRun');
 expect(await cnConstituentsView(deps,{code:'unknown'})).toEqual({state:'unknown_industry'});
 expect(activeRun).not.toHaveBeenCalled();
});

it.each(['scheme:sw2021:2021','vendor:gildata:industry-financials'])('withholds before vendor reads when %s is unavailable',async key=>{
 for(const status of ['internal','missing','throws']){
  const deps=await setup(false);
  vi.spyOn(deps.tables,'select').mockImplementation(async(_,match)=>{
   if(match.dataset_key!==key)return [{status:'public'}];
   if(status==='throws')throw Error();
   return status==='missing'?[]:[{status}];
  });
  const touched=vi.fn(()=>{throw Error('vendor read');});
  deps.db=new Proxy(deps.db,{get:touched});
  for(const view of await Promise.all([cnListView(deps,list),cnDetailView(deps,detail),cnConstituentsView(deps,{code})]))
   expect(view).toEqual({state:'withheld'});
  expect(touched).not.toHaveBeenCalled();
 }
});
