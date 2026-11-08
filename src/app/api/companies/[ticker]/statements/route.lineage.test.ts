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
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/statements/route';
import {CN,OLD,US,cnFact,emptySnapshot,fact,filingRow,makeDeps,record,seededTables,summary} from '@/lib/company/route-test-kit';
const get=(h=GET,ticker='AAPL',query='statement=IS&basis=annual&asOf=2025-01-31')=>h(new Request(`https://alpha.example/api/companies/${ticker}/statements?${query}`),{params:Promise.resolve({ticker})});
const members=[US,OLD].sort();
  const revs=members.map(issuer_id=>({issuer_id,state_rev:3}));
const env=(p:Partial<ReadFactsLineageResult>={}):ReadFactsLineageResult=>({lineage:members,stateRevs:revs,rows:[],conflicts:[],truncated:false,...p});
const multi=()=>{vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue(members);
  vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env());};
const cells=(b:{rows:{concept:string;cells:Record<string,unknown>}[]},concept='revenue')=>Object.values(b.rows.find(r=>r.concept===concept)?.cells??{});
async function seedHistory(){
 const db=memoryFactsDb(),rows:FactRow[]=[];
 for(const owner of [OLD,US]){
  const batch=randomUUID();
  await db.reconcileScope('US',[{issuer_id:owner,reasons:[],priority:1,fetch_key:'test'}]);
  await db.claimLease(owner,'US',batch,60);
  const run=await db.beginRun(owner,'US',batch,1);
  const manifest:string[]=[];
  // Predecessor-only 2022 plus a revised 2023 disclosure; divergent same-date 2024 rows are excluded.
  const data=owner===OLD?[['2022-09-30','2022-11-01','80'],['2023-09-30','2023-11-01','100'],['2024-09-30','2024-12-01','991']]:[['2023-09-30','2024-11-01','110'],['2024-09-30','2024-12-01','992']];
  for(const [end,date,value] of data){const filingId=randomUUID();manifest.push(filingId);
  await db.stageFilings(run,[{filing_id:filingId,issuer_id:owner,sourceRef:filingId,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:Number(end.slice(0,4)),fiscalPeriod:'FY',periodEnd:end,availableDate:date,url:`https://www.sec.gov/${owner}`}]);
  const row=fact({issuer_id:owner,filing_id:filingId,run_id:run,period_start:`${Number(end.slice(0,4))-1}-10-01`,period_end:end,available_date:date,value,value_text:value,raw_hash:rawHashOf('a'.repeat(64),'locator')});
  await db.stageFacts(run,[{...row,consolidation:'consolidated'}]);rows.push(row);}
  await db.publishRun(run,manifest);
 }
 db.setTopology({[OLD]:{status:'merged',merged_into:US}});
  mocks.deps.facts=db;
 vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async ids=>new Map(ids.filter(id=>!mocks.deps.noEvidence.has(id)).map(id=>{const row=rows.find(r=>r.fact_id===id)!;return [id,record(id,{raw_hash:row.raw_hash,run_id:row.run_id,snapshot_sha256:'a'.repeat(64),hash_locator:'locator',snapshot_path:`edgar/${row.issuer_id}/${'a'.repeat(64)}.json`})];})));
 return {db,rows};
}
describe('statements disclosure lineage with real memory facts and evidence gate',()=>{
 beforeEach(async()=>{vi.clearAllMocks();
  mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 it.each([['public',GET,'AAPL'],['admin',ADMIN_GET,'AAPL'],['alias',GET,'OLDX']] as const)('includes predecessor periods and global revisions, excludes conflicts (%s)',async(_mode,h,ticker)=>{
  const {db,rows}=await seedHistory();
  const response=await get(h,ticker);
  const body=await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({issuerId:US,lineage:members,stateRevs:await db.stateRevs(members,'US'),truncated:false});
  expect(cells(body)).toEqual([expect.objectContaining({kind:'fact',value:'110',disclosureSeq:2,isRevision:true}),expect.objectContaining({kind:'fact',value:'80',disclosureSeq:1})]);
  expect(body.factOwners).toEqual({[rows[0].fact_id]:OLD,[rows[3].fact_id]:US});
  expect(body.evidence[rows[0].fact_id].snapshot.path).toContain(OLD);
  expect(body.conflicts).toHaveLength(1);
  expect(body.conflicts[0].factIds).toEqual([rows[2].fact_id,rows[4].fact_id].sort());
  expect(JSON.stringify(body)).not.toMatch(/"991"|"992"|"100"/);
  expect(mocks.deps.snapshot).not.toHaveBeenCalled();
  if(h===ADMIN_GET)expect(response.headers.get('cache-control')).toBe('private, no-store');
 });
 it('replays predecessor disclosure before successor revision and never reveals missing evidence',async()=>{
  const {rows}=await seedHistory();
  mocks.deps.noEvidence.add(rows[0].fact_id);
  const body=await (await get(GET,'AAPL','statement=IS&basis=disclosed&asOf=2024-01-01')).json();
  expect(cells(body)).toEqual([expect.objectContaining({kind:'fact',value:'100',disclosureSeq:1}),expect.objectContaining({kind:'withheld',reason:'evidence_incomplete'})]);
  expect(body.withheld.evidenceIncomplete).toBe(1);
  expect(body.evidence[rows[0].fact_id]).toBeUndefined();
 });
 it.each(['missing','wrong-owner','future','unpublished'] as const)('withholds %s filing without legacy refill',async(mode)=>{
  const {db,rows}=await seedHistory();
  const filings=await mocks.deps.lineageFilings(members,'US');
  const old=filings.find(f=>f.filing_id===rows[0].filing_id)!;
  vi.mocked(mocks.deps.lineageFilings).mockResolvedValue(filings.filter(f=>f!==old).concat(mode==='missing'?[]:[{...old,...(mode==='wrong-owner'?{issuer_id:US}:mode==='future'?{available_date:'2026-01-01'}:{mapping_gen:0})}]));
  const fallback=vi.spyOn(db,'filingsOfIssuer'),factsFallback=vi.spyOn(db,'factsByIds');
  const body=await (await get()).json();
  expect(cells(body)[1]).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.evidence[rows[0].fact_id]).toBeUndefined();
  expect(fallback).not.toHaveBeenCalled();
  expect(factsFallback).not.toHaveBeenCalled();
 });
 it('derives single quarters from globally sequenced history, preserving original input owners',async()=>{
  multi();
  const hash=rawHashOf('a'.repeat(64),'locator');
  const q1=fact({issuer_id:OLD,period_start:'2023-01-01',period_end:'2023-03-31',duration:'3M',value:'10',value_text:'10',raw_hash:hash});
  const half=fact({filing_id:randomUUID(),period_start:'2023-01-01',period_end:'2023-06-30',duration:'6M',value:'30',value_text:'30',raw_hash:hash});
  vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({rows:[q1,half]}));
  vi.mocked(mocks.deps.lineageFilings).mockResolvedValue([q1,half].map(r=>filingRow({issuer_id:r.issuer_id,filing_id:r.filing_id})));
  vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async ids=>new Map(ids.map(id=>[id,record(id,{raw_hash:hash,snapshot_sha256:'a'.repeat(64),hash_locator:'locator'})])));
  const response=await get(GET,'AAPL','statement=IS&basis=quarterly&asOf=2025-01-31');
  const body=await response.json();
  expect(response.status).toBe(200);
  expect(cells(body)[0]).toMatchObject({kind:'derived',value:'20',inputs:expect.arrayContaining([expect.objectContaining({factId:q1.fact_id}),expect.objectContaining({factId:half.fact_id})])});
  expect(body.factOwners).toEqual({[q1.fact_id]:OLD,[half.fact_id]:US});
  mocks.deps.noEvidence.add(q1.fact_id);
  vi.mocked(mocks.deps.company.evidenceOf).mockResolvedValue(new Map());
  const withheld=await (await get(GET,'AAPL','statement=IS&basis=quarterly&asOf=2025-01-31')).json();
  expect(cells(withheld)[0]).toMatchObject({kind:'withheld'});
  expect(JSON.stringify(withheld)).not.toContain('"value":"20"');
 });
 it('uses CN predecessor owner for PDF lookup and withholds public values without PDF',async()=>{
  const lineage=[CN,OLD].sort(),stateRevs=lineage.map(issuer_id=>({issuer_id,state_rev:3}));multi();
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue(lineage);
  const row=cnFact({issuer_id:OLD,raw_hash:rawHashOf('a'.repeat(64),'locator')});
  vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({lineage,stateRevs,rows:[row]}));
  vi.mocked(mocks.deps.lineageFilings).mockResolvedValue([filingRow({issuer_id:OLD,market:'CN',filing_id:row.filing_id,source:'tushare',document_ref:'doc',document_url:'https://static.cninfo.com.cn/doc.pdf'})]);
  vi.mocked(mocks.deps.company.evidenceOf).mockResolvedValue(new Map([[row.fact_id,record(row.fact_id,{source:'tushare',raw_hash:row.raw_hash,snapshot_sha256:'a'.repeat(64),hash_locator:'locator'})]]));
  const body=await (await get(GET,'600519.SH')).json();
  expect(cells(body,'revenue_operating')[0]).toMatchObject({kind:'withheld',reason:'citation_pending'});
  expect(mocks.deps.pdf.locate).toHaveBeenCalledWith(OLD,'CN',[row.fact_id]);
  expect(body.evidence).toEqual({});
 });
 it.each(['membership','revision','envelope-members','incomplete-vector','duplicate-vector','missing-target'] as const)('bounds %s instability at three attempts with no-store',async(mode)=>{
  multi();
  if(mode==='membership'){let n=0;
  vi.mocked(mocks.deps.facts.lineageOf).mockImplementation(async()=>++n%2?members:[US]);}if(mode==='revision'){let n=0;
  vi.mocked(mocks.deps.facts.stateRevs).mockImplementation(async()=>revs.map(r=>({...r,state_rev:++n})));}if(mode==='envelope-members')vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({lineage:[US]}));
  if(mode==='incomplete-vector')vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({stateRevs:[revs[0]]}));
  if(mode==='duplicate-vector')vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({stateRevs:[revs[0],revs[0]]}));
  if(mode==='missing-target')vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue([OLD]);
  const response=await get();
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({error:{code:'lineage_unstable'}});
  expect(vi.mocked(mocks.deps.facts.lineageOf).mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(vi.mocked(mocks.deps.facts.lineageOf).mock.calls.length).toBeLessThanOrEqual(6);
 });
 it('fences owner evidence reads and detects membership added after a single snapshot',async()=>{
  multi();
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValueOnce([US]);
  vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[fact({value_text:'99999'})]}));
  const body=await (await get()).json();
  expect(body.lineage).toEqual(members);
  expect(JSON.stringify(body)).not.toContain('99999');
  const {db}=await seedHistory();
  const state=db.stateRevs.bind(db);
  let changed=false;vi.spyOn(db,'stateRevs').mockImplementation(async(ids,market)=>(await state(ids,market)).map(r=>({...r,state_rev:r.state_rev+(changed?1:0)})));
  vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async()=>{changed=true;return new Map();});
  expect((await get()).status).toBe(503);
 });
 it('suppresses truncated data and preserves atomic single snapshots',async()=>{
  multi();
  vi.mocked(mocks.deps.facts.readFactsLineage).mockResolvedValue(env({truncated:true,rows:[fact({value_text:'987654'})]}));
  let response=await get();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({truncated:true,rows:[],periods:[],filings:{},factOwners:{},evidence:{}});
  expect(mocks.deps.company.evidenceOf).not.toHaveBeenCalled();
  mocks.deps=makeDeps(await seededTables());
  vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[fact()],filings:[summary()]}));
  response=await get();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({lineage:[US],stateRevs:[{issuer_id:US,state_rev:1}]});
  expect(mocks.deps.facts.stateRevs).not.toHaveBeenCalled();
 });
});
