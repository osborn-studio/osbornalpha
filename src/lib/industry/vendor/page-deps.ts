import {cookies} from 'next/headers';
import {isAdminViewer} from '../admin-viewer';
import {memoryTableClient} from '../../db/memory-table-client';
import {supabaseTableClient} from '../../db/table-client';
import {getAdminSupabase} from '../../supabase/admin';
import {memoryVendorRawStore} from '../../vendor/raw-store';
import {fixtureMode,E2E_COOKIE} from '../fixture-mode';
import {memoryVendorIndustryDb,supabaseVendorIndustryDb} from './db';
import {fixtureDirSource} from './fixtures-dir';
import {runGildataFinancials,runGildataMemberships} from './ingest';
import type {VendorPageDeps} from './page-read';
import {SW2021_L1_GILDATA} from './sw2021-gildata-codes';
import {VENDOR_DATASET_KEYS} from './types';

async function seedFixtures(){
 const db=memoryVendorIndustryDb(),tables=memoryTableClient(),raw=memoryVendorRawStore();
 for(const dataset_key of ['scheme:sw2021:2021',...VENDOR_DATASET_KEYS])
  await tables.insert('industry_dataset_licenses',{dataset_key,status:'internal'});
 // Page and replay workers seed independently. Address the same synthetic generation by its content.
 const createRun=db.createRun;
 db.createRun=run=>{
  const hash=run.content_hash;
  const run_id=[hash.slice(0,8),hash.slice(8,12),'8'+hash.slice(13,16),'a'+hash.slice(17,20),hash.slice(20,32)].join('-');
  return createRun({...run,run_id});
 };
 const deps={db,tables,raw,now:()=>new Date(),codeVersion:'synthetic-fixture',
  source:fixtureDirSource('src/lib/vendor/gildata/fixtures'),
  universe:SW2021_L1_GILDATA.filter(row=>['270000','480000'].includes(row.gildataCode))};
 const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
 for(const ingest of [runGildataFinancials,runGildataMemberships]){
  const result=await ingest(deps,opts);
  if(result.status!=='success')throw Error('vendor_fixture_failed');
 }
 return {db,tables,raw};
}

let seeded:ReturnType<typeof seedFixtures>|undefined;
/** Only isolated fixture servers may impersonate an admin. A cookie read failure closes access. */
export async function authorizedVendorFixtures(){
 if(!fixtureMode())return null;
 try{if((await cookies()).get(E2E_COOKIE)?.value==='unlicensed')return null;}catch{return null;}
 seeded??=seedFixtures().catch(error=>{seeded=undefined;throw error;});
 return seeded;
}

export async function vendorPageDeps():Promise<VendorPageDeps>{
 const now=new Date();
 if(fixtureMode()){
  const fixture=await authorizedVendorFixtures();
  return fixture?{...fixture,now,isAdmin:async()=>true}:
   {db:memoryVendorIndustryDb(),tables:memoryTableClient(),now,isAdmin:async()=>false};
 }
 // Resolve the service client inside the licence lookup so even a configuration failure closes access.
 let admin:ReturnType<typeof getAdminSupabase>|undefined;
 const service=()=>admin??=getAdminSupabase();
 return {now,isAdmin:isAdminViewer,get tables(){return supabaseTableClient(service());},get db(){return supabaseVendorIndustryDb(service());}};
}
