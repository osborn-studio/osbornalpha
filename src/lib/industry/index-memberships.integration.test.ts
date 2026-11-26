import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {freshMigratedDatabase,replayFiles,type FreshDatabase} from '../documents/fresh-db';

describe.skipIf(!process.env.S4_TEST_STATE)('index membership snapshot RPC',()=>{
 let fresh:FreshDatabase;
 const tickers=Array.from({length:250},(_,i)=>`${781000+i}.SH`);
 const source='tushare:index_weight',date='2026-10-30';
 const apply=async(universe:string|null,asOf:string|null,src:string|null,list:readonly (string|null)[]|null,dryRun=false)=>{
  const client=await fresh.pool.connect();
  try{
   await client.query('set role service_role');
   return (await client.query('select public.apply_index_membership($1,$2,$3,$4,$5) as receipt',[universe,asOf,src,list,dryRun])).rows[0].receipt;
  }finally{await client.query('reset role');client.release();}
 };
 beforeAll(async()=>{fresh=await freshMigratedDatabase(JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl);},120000);
 afterAll(async()=>{await fresh?.drop();});
 it('replays the migration and permits only service execution',async()=>{
  const legacy=await fresh.pool.query("select to_regprocedure('public.apply_csi300_membership(date,text,text[],boolean)') as old_rpc");
  expect(legacy.rows[0].old_rpc).toBeNull();
  await replayFiles(fresh.pool,['supabase/migrations/20261216090000_index_universe_memberships.sql']);
  for(const role of ['anon','authenticated','service_role']){
   const result=await fresh.pool.query("select has_function_privilege($1,'public.apply_index_membership(text,date,text,text[],boolean)','execute') as ok",[role]);
   expect(result.rows[0].ok).toBe(role==='service_role');
  }
 });
 it('rejects invalid dates, sources, constituent strings and distinct counts',async()=>{
  for(const universe of ['a_stock',null])
   await expect(apply(universe,date,source,tickers)).rejects.toMatchObject({code:'22023',message:'invalid_index_universe'});
  for(const size of [39,61])
   await expect(apply('star50',date,source,tickers.slice(0,size))).rejects.toMatchObject({code:'22023',message:'invalid_index_snapshot'});
  for(const [asOf,src,list] of [[null,source,tickers],[date,'  ',tickers],[date,source,null],[date,source,Array(250).fill(tickers[0])],
   [date,source,[...tickers,'bad']],[date,source,[...tickers,null]],[date,source,Array.from({length:351},(_,i)=>`${782000+i}.BJ`)]] as const)
   await expect(apply('csi300',asOf,src,list)).rejects.toMatchObject({code:'22023',message:expect.stringMatching(/^invalid_index_snapshot/)});
 });
 it('previews and applies only known tickers, then retires and reactivates without deletion',async()=>{
  const known=tickers.slice(0,-1),unknown=tickers.at(-1)!;
  await fresh.pool.query("insert into public.stocks_universe(ticker,name,market) select ticker,'Fixture','A' from unnest($1::text[]) ticker",[known]);
  const snapshot=[...tickers,tickers[0]],receipt={universe:'csi300',as_of:date,fetched:250,activated:249,kept:0,deactivated:0,unknown:1,unknown_tickers:[unknown]};
  expect(await apply('csi300',date,source,snapshot,true)).toEqual({...receipt,dry_run:true});
  const rows=()=>fresh.pool.query("select ticker,is_active,updated_at::text,as_of_date::text,source,rank,market_cap_usd from public.security_universe_memberships where universe='csi300' order by ticker");
  expect((await rows()).rowCount).toBe(0);
  expect(await apply('csi300',date,source,snapshot)).toEqual({...receipt,dry_run:false});
  expect(await apply('csi300',date,source,tickers)).toMatchObject({activated:0,kept:249,deactivated:0});
  const next=[...tickers.slice(1),'787777.SZ'],later='2026-11-30',before=(await rows()).rows;
  const changes={activated:0,kept:248,deactivated:1,unknown:2};
  expect(await apply('csi300',later,source,next,true)).toMatchObject(changes);
  expect((await rows()).rows).toEqual(before);
  expect(await apply('csi300',later,source,next)).toMatchObject(changes);
  const retired=(await rows()).rows[0];
  expect(retired).toMatchObject({ticker:tickers[0],is_active:false,as_of_date:later,source,rank:null,market_cap_usd:null});
  expect(await apply('csi300','2026-12-31',source,next)).toMatchObject({deactivated:0});
  expect((await rows()).rows[0]).toEqual(retired);
  const csiRows=(await rows()).rows;
  expect(await apply('star50',date,source,tickers.slice(0,50))).toMatchObject({universe:'star50',fetched:50,activated:50,kept:0,deactivated:0});
  expect((await rows()).rows).toEqual(csiRows);
  const unknownStar=Array.from({length:50},(_,i)=>`${783000+i}.SZ`);
  expect(await apply('star50',later,source,unknownStar)).toMatchObject({unknown:50,deactivated:50});
  await expect(apply('star50',date,source,tickers.slice(0,50))).rejects.toMatchObject({code:'22023',message:'stale_index_snapshot'});
  await expect(apply('csi300',date,source,tickers)).rejects.toMatchObject({code:'22023',message:expect.stringMatching(/^stale_index_snapshot/)});
  expect(await apply('csi300','2026-12-31',source,tickers)).toMatchObject({activated:1,kept:248,deactivated:0});
 });
});
