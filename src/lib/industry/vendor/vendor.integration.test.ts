import {memoryTableClient} from '../../db/memory-table-client';
import {memoryVendorIndustryDb} from './db';
import {cnListView,cnDetailView,cnConstituentsView,type VendorCell} from './page-read';
import {readVendorAdmin} from './admin-read';
import type {Observation} from './types';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {freshMigratedDatabase,replayFiles,type FreshDatabase} from '../../documents/fresh-db';
import {pgTableClient} from '../../db/pg-table-client';
import {memoryVendorRawStore} from '../../vendor/raw-store';
import {fixtureGildataSource,loadFixtureBody} from '../../vendor/gildata/fixture-source';
import {replayFinancialCell} from '../../vendor/gildata/parse-financials';
import {runGildataFinancials,runGildataMemberships} from './ingest';
import {fixtureDirSource} from './fixtures-dir';
import {pgVendorIndustryDb} from './pg-vendor-db';
import {SW2021_L1_GILDATA} from './sw2021-gildata-codes';

const migration='supabase/migrations/20261214090000_industry_vendor_gildata.sql';
const tables=['vendor_evidence_objects','vendor_retrievals','industry_vendor_runs','industry_vendor_classifications','industry_vendor_memberships','industry_vendor_observations'];
const functions=['record_vendor_retrieval(jsonb)','create_industry_vendor_run(jsonb)','stage_industry_vendor_rows(uuid,text,jsonb)','activate_industry_vendor_run(uuid)','fail_industry_vendor_run(uuid,text)','industry_vendor_rows_frozen()'];
describe.skipIf(!process.env.S4_TEST_STATE)('private Gildata storage',()=>{
 let fresh:FreshDatabase;
 beforeAll(async()=>{fresh=await freshMigratedDatabase(JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl);},120000);
 afterAll(async()=>{await fresh?.drop();});
 it('replays the migration with stable column, constraint, index, policy and trigger definitions',async()=>{
  const schema=async()=>Promise.all([
   'select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema=\'public\' and table_name=any($1) order by 1,2',
   'select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid::regclass::text=any($1) order by 1',
   'select indexdef from pg_indexes where tablename=any($1) order by 1',
   'select * from pg_policies where tablename=any($1) order by tablename,policyname',
   'select pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid::regclass::text=any($1) order by 1'
  ].map(async sql=>(await fresh.pool.query(sql,[tables])).rows));
  const before=await schema();await replayFiles(fresh.pool,[migration,migration]);expect(await schema()).toEqual(before);
 });
 it('exposes only service reads and the five service RPCs',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   for(const table of tables){
    for(const priv of ['select','insert','update','delete','truncate']){
     expect((await fresh.pool.query('select has_table_privilege($1,$2,$3) as ok',[role,table,priv])).rows[0].ok).toBe(role==='service_role'&&priv==='select');
    }
   }
   for(const fn of functions)expect((await fresh.pool.query('select has_function_privilege($1,$2,\'execute\') as ok',[role,fn])).rows[0].ok).toBe(role==='service_role'&&fn!==functions[5]);
  }
  const rls=await fresh.pool.query('select relname,relrowsecurity from pg_class where oid=any(select t::regclass from unnest($1::text[]) t)',[tables]);
  expect(rls.rows).toHaveLength(6);expect(rls.rows.every(r=>r.relrowsecurity)).toBe(true);
  const client=await fresh.pool.connect();
  try{
   for(const role of ['anon','authenticated','service_role']){
    await client.query('set role '+role);
    for(const table of tables){
     const read=client.query('select * from public.'+table+' limit 0');
     if(role==='service_role')await expect(read).resolves.toBeDefined();
     else await expect(read).rejects.toMatchObject({code:'42501'});
    }
    await client.query('reset role');
   }
  }finally{await client.query('reset role');client.release();}
  expect((await fresh.pool.query('select status,industry_dataset_is_public(dataset_key) as visible from industry_dataset_licenses where dataset_key=$1',['vendor:gildata:industry-financials'])).rows).toEqual([{status:'internal',visible:false}]);
 });
 it('publishes complete snapshots, replays exact decimals and preserves the active run across failures',async()=>{
  const db=pgVendorIndustryDb(fresh.pool),raw=memoryVendorRawStore(),dir='src/lib/vendor/gildata/fixtures';
  const universe=SW2021_L1_GILDATA.filter(x=>['270000','480000'].includes(x.gildataCode));
  const deps={db,raw,tables:pgTableClient(fresh.pool),universe,source:fixtureDirSource(dir),now:()=>new Date('2026-11-24Z'),codeVersion:'test'};
  const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
  const members={...deps,universe:universe.slice(0,1)};
  expect(await runGildataMemberships(members,opts)).toMatchObject({status:'success',counts:{members:6}});
  expect(await runGildataMemberships(members,opts)).toMatchObject({counts:{unchanged:1}});
  expect(await db.activeRun('memberships')).toMatchObject({generation:1});
  expect(await runGildataFinancials(deps,opts)).toMatchObject({status:'success'});
  const run=(await db.activeRun('financials'))!;
  expect(await runGildataFinancials(deps,opts)).toMatchObject({counts:{unchanged:1}});
  expect(await db.listRuns('financials')).toMatchObject([{generation:1,status:'active'}]);
  const rows=(await fresh.pool.query('select o.*,e.sha256 from industry_vendor_observations o join vendor_retrievals r using(retrieval_id) join vendor_evidence_objects e using(sha256) where o.run_id=$1 and r.outcome=\'ok\'',[run.run_id])).rows;
  expect(rows).toHaveLength(192);
  for(const row of rows)expect(replayFinancialCell(await raw.get('gildata',row.sha256),row.locator,row.metric)).toBe(row.value_text);
  expect((await fresh.pool.query('select count(*)::int as n from industry_vendor_memberships join vendor_retrievals using(retrieval_id) join vendor_evidence_objects using(sha256) where outcome=\'ok\'')).rows[0].n).toBe(6);
  for(const cmd of ['update industry_vendor_observations set value=value','delete from industry_vendor_observations'])
   await expect(fresh.pool.query(cmd+' where run_id=$1',[run.run_id])).rejects.toThrow('append_only');
  await expect(db.stageClassifications(run.run_id,await db.classificationsOfRun(run.run_id))).rejects.toMatchObject({code:'run_not_building'});
  const source=fixtureGildataSource({resolve:r=>loadFixtureBody(dir+'/financials-'+(r.args.industry==='电子'?'270000':'480000')+'.json').replace('5011.55','5011.50')});
  expect(await runGildataFinancials({...deps,source},opts)).toMatchObject({status:'success'});
  expect(await db.activeRun('financials')).toMatchObject({generation:2});
  expect(await db.listRuns('financials')).toMatchObject([{generation:2,status:'active'},{generation:1,status:'superseded'}]);
  const bad=fixtureGildataSource({resolve:()=>loadFixtureBody(dir+'/empty.json')});
  expect(await runGildataFinancials({...deps,source:bad},opts)).toMatchObject({status:'failed'});
  expect(await db.activeRun('financials')).toMatchObject({generation:2});
  const [retrieval]=await db.listRetrievals(1);expect(retrieval.outcome).toBe('request_mismatch');
  const older=await db.createRun({...run,run_id:randomUUID()});
  await expect(db.activateRun(older.run_id)).rejects.toMatchObject({code:'incomplete_grid'});
  const [classification]=await db.classificationsOfRun(run.run_id);
  await expect(db.stageMemberships(older.run_id,[])).rejects.toMatchObject({code:'wrong_run_kind'});
  const failedId=randomUUID();
  const evidence={...retrieval,retrieval_id:failedId,object_path:'gildata/'+retrieval.sha256+'.json',
   byte_length:(await raw.get('gildata',retrieval.sha256)).length,content_type:'application/json',outcome:'parse_failed' as const};
  expect(await db.recordRetrieval(evidence)).toBe(failedId);
  expect(await db.recordRetrieval(evidence)).toBe(failedId);
  await expect(db.recordRetrieval({...evidence,object_path:'different'})).rejects.toMatchObject({code:'evidence_conflict'});
  const otherHash='f'.repeat(64);
  await expect(db.recordRetrieval({...evidence,sha256:otherHash,object_path:'gildata/'+otherHash+'.json'})).rejects.toMatchObject({code:'retrieval_conflict'});
  await expect(db.stageClassifications(older.run_id,[{...classification,retrieval_id:failedId}])).rejects.toMatchObject({code:'retrieval_not_ok'});
  await expect(fresh.pool.query("update vendor_retrievals set request_canonical='{\"Authorization\":\"x\"}' where retrieval_id=$1",[failedId])).rejects.toMatchObject({code:'23514'});
  const obs=(await db.observationsOfRun(run.run_id,{code:'801080.SI'})).find(row=>row.status==='ok')!;
  for(const patch of [{retrieval_id:null},{status:'missing',value:null,value_text:null,missing_reason:null},{value:999999999}]){
   await expect(fresh.pool.query('insert into industry_vendor_observations select * from jsonb_populate_record(null::industry_vendor_observations,$1)',[{...obs,run_id:older.run_id,...patch}])).rejects.toMatchObject({code:'23514'});
  }
  const newer=await db.createRun({...run,run_id:randomUUID()});
  await db.stageClassifications(newer.run_id,await db.classificationsOfRun(run.run_id));
  for(const {indexCode:code} of universe)await db.stageObservations(newer.run_id,await db.observationsOfRun(run.run_id,{code}));
  await db.activateRun(newer.run_id);
  await expect(db.activateRun(older.run_id)).rejects.toMatchObject({code:'obsolete_run'});
 },60000);
});

describe.skipIf(!process.env.S4_TEST_STATE)('vendor page reads on PG17',()=>{
 let fresh:FreshDatabase;
 beforeAll(async()=>{fresh=await freshMigratedDatabase(JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl);},120000);
 afterAll(async()=>{await fresh?.drop();});
 it('gates, joins and replays both fixture industries',async()=>{
  const db=pgVendorIndustryDb(fresh.pool),tables=pgTableClient(fresh.pool),raw=memoryVendorRawStore();
  const universe=SW2021_L1_GILDATA.filter(r=>['270000','480000'].includes(r.gildataCode));
  const now=new Date('2026-11-24Z'),dir='src/lib/vendor/gildata/fixtures/';
  const source=fixtureGildataSource({now:()=>now,resolve:r=>{
   const industry=universe.find(i=>i.nameZh===r.args.industry)!;
   if(r.templateId==='sw_l1_members')return loadFixtureBody(dir+'members-270000.json').replaceAll('电子',industry.nameZh);
   return loadFixtureBody(dir+'financials-'+industry.gildataCode+'.json');
  }});
  const ingest={db,tables,raw,source,universe,now:()=>now,codeVersion:'test'};
  const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
  expect((await runGildataFinancials(ingest,opts)).status).toBe('success');
  const deps={db,tables,now,isAdmin:async()=>true},code=universe[0].indexCode;
  const views=(d:typeof deps)=>Promise.all([cnListView(d,{metric:'revenue_yoy',basis:'annual'}),
   cnDetailView(d,{code,metric:'gross_margin',basis:'quarter',window:'all'}),cnConstituentsView(d,{code})]);
  // Remove the scheme licence before the membership run takes a foreign key on it.
  const removed=await fresh.pool.query("delete from industry_dataset_licenses where dataset_key='scheme:sw2021:2021' returning *");
  expect(removed.rowCount).toBe(1);
  expect(await views(deps)).toEqual(Array(3).fill({state:'withheld'}));
  await tables.insert('industry_dataset_licenses',removed.rows[0]);
  expect((await runGildataMemberships(ingest,opts)).status).toBe('success');
  expect(await views({...deps,isAdmin:async()=>false})).toEqual(Array(3).fill({state:'withheld'}));
  const [list,detail,members]=await views(deps);
  if(list.state!=='ok'||detail.state!=='ok'||members.state!=='ok')throw Error('expected active views');
  expect(list.nodes).toHaveLength(2);expect(members.total).toBe(6);
  const hashes=new Set((await fresh.pool.query('select sha256 from vendor_evidence_objects')).rows.map(r=>r.sha256));
  async function verify(cell:VendorCell){
   if(cell.derived){for(const input of cell.derived.inputs)if(input)await verify(input);}
   else if(cell.status==='ok'){
    const s=cell.source!;
    expect(hashes.has(s.sha256)).toBe(true);
    expect(replayFinancialCell(await raw.get(s.vendor,s.sha256),cell.source!.locator as NonNullable<Observation['locator']>,cell.metric)).toBe(cell.valueText);
   }
  }
  for(const c of [...list.cells,...detail.latest,...detail.series,...list.nodes.flatMap(n=>n.members?[n.members]:[])])await verify(c);
  for(const m of [...members.rows,...detail.constituents!.preview])expect(hashes.has(m.source.sha256)).toBe(true);
  const yoy=list.cells.find(c=>c.code===code&&c.status==='ok')!;
  const [current,base]=yoy.derived!.inputs;
  // Compare in hundredths of one percent, independently of the production decimal helpers.
  function hundredths(text:string){
   const [whole,fraction='']=text.split('.');
   expect(fraction.length).toBeLessThanOrEqual(2);
   return BigInt(whole+fraction.padEnd(2,'0'));
  }
  const a=hundredths(current.valueText!),b=hundredths(base!.valueText!),delta=(a-b)*10000n;
  expect(hundredths(yoy.valueText!)).toBe((delta+(delta<0n?-b/2n:b/2n))/b);
  const query={metrics:['gross_margin','revenue_cum'],periodEnds:list.periodEnds};
  const memory=memoryVendorIndustryDb();
  expect((await runGildataFinancials({...ingest,db:memory,tables:memoryTableClient()},opts)).status).toBe('success');
  // Independent ingests assign independent retrieval UUIDs. Compare every observation field using its evidence digest.
  const normalize=async(adapter:typeof db)=>{
   const run=(await adapter.activeRun('financials'))!;
   const rows=await adapter.observationsGrid(run.run_id,query);
   const refs=new Map((await adapter.retrievalsByIds(rows.map(r=>r.retrieval_id!))).map(r=>[r.retrieval_id,r.sha256]));
   return rows.map(({retrieval_id,...r})=>({...r,sha256:refs.get(retrieval_id!)}));
  };
  expect(await normalize(db)).toEqual(await normalize(memory));
  const url=new URL('https://example.test/?view=replay&metric=revenue_cum&duration=YTD&code='+code+'&period_end='+current.periodEnd);
  expect(await readVendorAdmin(url,{db,tables,raw})).toMatchObject({match:true,replayed_text:current.valueText});
 },60000);
});
