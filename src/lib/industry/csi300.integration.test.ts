import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {freshMigratedDatabase,replayFiles,type FreshDatabase} from '../documents/fresh-db';

describe.skipIf(!process.env.S4_TEST_STATE)('CSI 300 snapshot RPC',()=>{
 let fresh:FreshDatabase;
 const tickers=Array.from({length:250},(_,i)=>`${781000+i}.SH`);
 const source='tushare:index_weight',date='2026-10-30';
 const apply=async(asOf:string|null,src:string|null,list:readonly (string|null)[]|null,dryRun=false)=>{
  const client=await fresh.pool.connect();
  try{
   await client.query('set role service_role');
   return (await client.query('select public.apply_csi300_membership($1,$2,$3,$4) as receipt',[asOf,src,list,dryRun])).rows[0].receipt;
  }finally{await client.query('reset role');client.release();}
 };
 beforeAll(async()=>{fresh=await freshMigratedDatabase(JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl);},120000);
 afterAll(async()=>{await fresh?.drop();});
 it('replays the migration and permits only service execution',async()=>{
  await replayFiles(fresh.pool,['supabase/migrations/20261215090000_universe_csi300.sql']);
  for(const role of ['anon','authenticated','service_role']){
   const result=await fresh.pool.query("select has_function_privilege($1,'public.apply_csi300_membership(date,text,text[],boolean)','execute') as ok",[role]);
   expect(result.rows[0].ok).toBe(role==='service_role');
  }
 });
 it('rejects invalid dates, sources, constituent strings and distinct counts',async()=>{
  for(const [asOf,src,list] of [[null,source,tickers],[date,'  ',tickers],[date,source,null],[date,source,Array(250).fill(tickers[0])],
   [date,source,[...tickers,'bad']],[date,source,[...tickers,null]],[date,source,Array.from({length:351},(_,i)=>`${782000+i}.BJ`)]] as const)
   await expect(apply(asOf,src,list)).rejects.toMatchObject({code:'22023',message:expect.stringMatching(/^invalid_csi300_snapshot/)});
 });
 it('previews and applies only known tickers, then retires and reactivates without deletion',async()=>{
  const known=tickers.slice(0,-1),unknown=tickers.at(-1)!;
  await fresh.pool.query("insert into public.stocks_universe(ticker,name,market) select ticker,'Fixture','A' from unnest($1::text[]) ticker",[known]);
  const snapshot=[...tickers,tickers[0]],receipt={as_of:date,fetched:250,activated:249,kept:0,deactivated:0,unknown:1,unknown_tickers:[unknown]};
  expect(await apply(date,source,snapshot,true)).toEqual({...receipt,dry_run:true});
  const rows=()=>fresh.pool.query("select ticker,is_active,as_of_date::text,source,rank,market_cap_usd from public.security_universe_memberships where universe='csi300' order by ticker");
  expect((await rows()).rowCount).toBe(0);
  expect(await apply(date,source,snapshot)).toEqual({...receipt,dry_run:false});
  expect(await apply(date,source,tickers)).toMatchObject({activated:0,kept:249,deactivated:0});
  const next=[...tickers.slice(1),'787777.SZ'],later='2026-11-30',before=(await rows()).rows;
  const changes={activated:0,kept:248,deactivated:1,unknown:2};
  expect(await apply(later,source,next,true)).toMatchObject(changes);
  expect((await rows()).rows).toEqual(before);
  expect(await apply(later,source,next)).toMatchObject(changes);
  expect((await rows()).rows[0]).toEqual({ticker:tickers[0],is_active:false,as_of_date:later,source,rank:null,market_cap_usd:null});
  await expect(apply(date,source,tickers)).rejects.toMatchObject({code:'22023',message:expect.stringMatching(/^stale_csi300_snapshot/)});
  expect(await apply(later,source,tickers)).toMatchObject({activated:1,kept:248,deactivated:0});
 });
});
