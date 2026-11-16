import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {rawHashOf} from '@/lib/facts/providers/shared';
import type {FactRow,ReadFactsLineageResult} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/facts/route';
import {CN,OLD,US,cnFact,emptySnapshot,fact,filingRow,makeDeps,record,seededTables,summary} from '@/lib/company/route-test-kit';

const Q='concept=revenue&periodStart=2022-09-25&periodEnd=2023-09-30&unit=USD&asOf=2025-01-31';
const get=(h=GET,ticker='AAPL')=>h(new Request(`https://alpha.example/api/companies/${ticker}/facts?${Q}`),{params:Promise.resolve({ticker})});
const members=[US,OLD].sort();
const revs=members.map(issuer_id=>({issuer_id,state_rev:3}));
const env=(p:Partial<ReadFactsLineageResult>={}):ReadFactsLineageResult=>({lineage:members,stateRevs:revs,rows:[],conflicts:[],truncated:false,...p});
const multi=()=>{
 vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue([OLD,US,OLD]);
 vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env());
};

// Real memory backend and real applyGate: no DB, provider or network dependencies.
async function seedHistory(){
 const db=memoryFactsDb();
 const rows:FactRow[]=[];
 for(const [owner,disclosures] of [[OLD,[['2023-11-03','100'],['2024-12-01','991']]], [US,[['2024-11-01','110'],['2024-12-01','992']]]] as const){
  const batch=randomUUID();
  await db.reconcileScope('US',[{issuer_id:owner,reasons:[],priority:1,fetch_key:'test'}]);
  await db.claimLease(owner,'US',batch,60);
  const run=await db.beginRun(owner,'US',batch,1);
  const manifest:string[]=[];
  for(const [date,value] of disclosures){
   const filingId=randomUUID();manifest.push(filingId);
   await db.stageFilings(run,[{filing_id:filingId,issuer_id:owner,sourceRef:filingId,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate:date,url:`https://www.sec.gov/${owner}`}]);
   const row=fact({issuer_id:owner,filing_id:filingId,run_id:run,available_date:date,value,value_text:value,raw_hash:rawHashOf('a'.repeat(64),'locator')});
   await db.stageFacts(run,[{...row,consolidation:'consolidated'}]);rows.push(row);
  }
  await db.publishRun(run,manifest);
 }
 db.setTopology({[OLD]:{status:'merged',merged_into:US}});
 mocks.deps.facts=db;
 vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async ids=>new Map(ids.filter(id=>!mocks.deps.noEvidence.has(id)).map(id=>{
  const row=rows.find(r=>r.fact_id===id)!;
  return [id,record(id,{raw_hash:row.raw_hash,run_id:row.run_id,snapshot_sha256:'a'.repeat(64),hash_locator:'locator',snapshot_path:`edgar/${row.issuer_id}/${'a'.repeat(64)}.json`})];
 })));
 return {db,rows};
}

describe('facts disclosure lineage',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 it.each([['public',GET,'AAPL'],['admin',ADMIN_GET,'AAPL'],['public',GET,'OLDX'],['admin',ADMIN_GET,'OLDX']] as const)('returns predecessor history with global sequence, owner evidence and excluded conflict metadata (%s)',async(_mode,handler,ticker)=>{
  const {db,rows}=await seedHistory();
  const response=await get(handler,ticker);const body=await response.json();
  expect(response.status).toBe(200);
  if(handler===ADMIN_GET)expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(body).toMatchObject({issuerId:US,lineage:members,stateRevs:await db.stateRevs(members,'US'),truncated:false});
  expect(body.series).toEqual([
   expect.objectContaining({issuerId:OLD,kind:'fact',value:'100',disclosureSeq:1,isCurrent:false,delta:null}),
   expect.objectContaining({issuerId:US,kind:'fact',value:'110',disclosureSeq:2,isCurrent:true,isRevision:true,delta:'10',relChange:'0.1'}),
  ]);
  expect(body.evidence[rows[0].fact_id].snapshot.path).toContain(OLD);
  expect(body.evidence[rows[2].fact_id].sourceDocument.url).toContain(US);
  expect(body.conflicts).toEqual([{key:expect.objectContaining({concept:'revenue',unit:'USD'}),availableDate:'2024-12-01',factIds:[rows[1].fact_id,rows[3].fact_id].sort()}]);
  expect(Object.keys(body.evidence).sort()).toEqual([rows[0].fact_id,rows[2].fact_id].sort());
  expect(JSON.stringify(body)).not.toContain('"991"');expect(JSON.stringify(body)).not.toContain('"992"');
  expect(mocks.deps.snapshot).not.toHaveBeenCalled();
 });
 it('real gate withholds missing evidence and breaks the cross-member delta chain',async()=>{
  const {rows}=await seedHistory();mocks.deps.noEvidence.add(rows[0].fact_id);
  const body=await (await get()).json();
  expect(body.series[0]).toMatchObject({issuerId:OLD,kind:'withheld',reason:'evidence_incomplete'});
  expect(body.series[0].value).toBeUndefined();
  expect(body.series[1]).toMatchObject({kind:'fact',value:'110',delta:null,relChange:null});
 });
 it.each(['missing','wrong-owner','future','unpublished'] as const)('fails closed on %s raw filing metadata, without fallback',async(mode)=>{
  const {db,rows}=await seedHistory();const filings=await mocks.deps.lineageFilings(members,'US');
  vi.mocked(mocks.deps.lineageFilings).mockResolvedValue(filings.filter(f=>f.filing_id!==rows[0].filing_id).concat(mode==='missing'?[]:[{...filings.find(f=>f.filing_id===rows[0].filing_id)!,...(mode==='wrong-owner'?{issuer_id:US}:mode==='future'?{available_date:'2026-01-01'}:{mapping_gen:0})}]));
  const fallback=vi.spyOn(db,'filingsOfIssuer');const factsFallback=vi.spyOn(db,'factsByIds');
  const body=await (await get()).json();
  expect(body.series[0]).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.series[0].value).toBeUndefined();expect(body.evidence[rows[0].fact_id]).toBeUndefined();
  expect(body.series[1]).toMatchObject({delta:null,relChange:null});
  expect(fallback).not.toHaveBeenCalled();expect(factsFallback).not.toHaveBeenCalled();
 });
 it.each([['public',GET],['admin',ADMIN_GET]] as const)('uses each CN owner for PDF evidence and preserves the admin citation exception (%s)',async(mode,handler)=>{
  const lineage=[CN,OLD].sort();const stateRevs=lineage.map(issuer_id=>({issuer_id,state_rev:3}));
  const hash=rawHashOf('a'.repeat(64),'locator');
  const old=cnFact({issuer_id:OLD,raw_hash:hash,disclosure_seq:1,value_text:'100'});
  const current=cnFact({filing_id:randomUUID(),raw_hash:hash,disclosure_seq:2,value_text:'110'});
  const doc='https://static.cninfo.com.cn/finalpage/2024-04-03/1219574887.PDF';
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue(lineage);
  vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({lineage,stateRevs,rows:[old,current]}));
  vi.mocked(mocks.deps.lineageFilings).mockResolvedValue([old,current].map(r=>filingRow({issuer_id:r.issuer_id,market:'CN',filing_id:r.filing_id,source:'tushare',document_ref:'doc',document_url:doc,available_date:r.available_date})));
  mocks.deps.pdfFor.add(old.fact_id); // Current owner's PDF is still missing.
  vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async ids=>new Map(ids.map(id=>[id,record(id,{source:'tushare',raw_hash:hash,snapshot_sha256:'a'.repeat(64),hash_locator:'locator'})])));
  const response=await handler(new Request(`https://alpha.example/api/companies/600519.SH/facts?concept=revenue_operating&periodStart=2023-01-01&periodEnd=2023-12-31&unit=CNY&asOf=2025-01-31`),{params:Promise.resolve({ticker:'600519.SH'})});
  const body=await response.json();expect(response.status).toBe(200);
  expect(body.series[0]).toMatchObject({issuerId:OLD,kind:'fact',value:'100'});
  expect(body.series[1]).toMatchObject(mode==='admin'?{issuerId:CN,kind:'fact',value:'110',delta:'10'}:{issuerId:CN,kind:'withheld',reason:'citation_pending'});
  expect(mocks.deps.pdf.locate).toHaveBeenCalledWith(OLD,'CN',[old.fact_id]);
  expect(mocks.deps.pdf.locate).toHaveBeenCalledWith(CN,'CN',[current.fact_id]);
  if(mode==='public'){expect(body.series[1].value).toBeUndefined();expect(body.evidence[current.fact_id]).toBeUndefined();}
 });
 it('preserves the single-member atomic snapshot without reading unrelated revision defaults',async()=>{
  const row=fact({raw_hash:rawHashOf('a'.repeat(64),'locator')});vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[row],filings:[summary()]}));
  vi.mocked(mocks.deps.company.evidenceOf).mockResolvedValue(new Map([[row.fact_id,record(row.fact_id,{raw_hash:row.raw_hash,snapshot_sha256:'a'.repeat(64),hash_locator:'locator'})]]));
  const response=await get();expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({stateRev:1,lineage:[US],stateRevs:[{issuer_id:US,state_rev:1}],series:[{issuerId:US,kind:'fact',value:row.value_text}]});
  expect(mocks.deps.facts.stateRevs).not.toHaveBeenCalled();
 });
 it('retries single becoming multi and returns only the stable lineage result',async()=>{
  multi();vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValueOnce([US]);
  vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[fact({value_text:'99999'})]}));
  const body=await (await get()).json();expect(body).toMatchObject({lineage:members,series:[]});
  expect(JSON.stringify(body)).not.toContain('99999');expect(mocks.deps.snapshot).toHaveBeenCalledTimes(1);
  expect(mocks.deps.facts.readFactsLineage).toHaveBeenCalledWith(members,'US',{concepts:['revenue'],asOf:'2025-01-31',from:'2023-09-30',to:'2023-09-30',history:true});
 });
 it.each(['membership','revision','envelope-members','incomplete-vector','duplicate-vector','missing-target'] as const)('bounds %s churn at three attempts and rejects with no-store',async(mode)=>{
  multi();
  if(mode==='membership'){let n=0;vi.mocked(mocks.deps.facts.lineageOf).mockImplementation(async()=>++n%2?members:[US]);}
  if(mode==='revision'){let n=0;vi.mocked(mocks.deps.facts.stateRevs).mockImplementation(async()=>revs.map(r=>({...r,state_rev:++n})));}
  if(mode==='envelope-members')vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({lineage:[US]}));
  if(mode==='incomplete-vector')vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({stateRevs:[revs[0]]}));
  if(mode==='duplicate-vector')vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({stateRevs:[revs[0],revs[0]]}));
  if(mode==='missing-target')vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue([OLD]);
  const response=await get();expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({error:{code:'lineage_unstable'}});
  expect(vi.mocked(mocks.deps.facts.lineageOf).mock.calls.length).toBeLessThanOrEqual(6);
  expect(vi.mocked(mocks.deps.facts.lineageOf).mock.calls.length).toBeGreaterThanOrEqual(3);
 });
 it('retries revision movement during owner evidence reads',async()=>{
  const {db}=await seedHistory();const state=db.stateRevs.bind(db);let changed=false;
  vi.spyOn(db,'stateRevs').mockImplementation(async(ids,market)=>(await state(ids,market)).map(r=>({...r,state_rev:r.state_rev+(changed?1:0)})));
  vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async()=>{changed=true;return new Map();});
  const response=await get();expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('no-store');
 });
 it('truncated lineage returns no partial facts, evidence, filings or values',async()=>{
  multi();vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({truncated:true,rows:[fact({value_text:'987654'})]}));
  const response=await get();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  const body=await response.json();expect(body).toMatchObject({truncated:true,lineage:members,series:[],otherUnitSeries:[],filings:{},evidence:{}});
  expect(JSON.stringify(body)).not.toContain('987654');expect(mocks.deps.company.evidenceOf).not.toHaveBeenCalled();
 });
});
