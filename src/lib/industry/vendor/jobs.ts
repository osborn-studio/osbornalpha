import {getAdminSupabase} from '../../supabase/admin';
import {supabaseTableClient} from '../../db/table-client';
import {gildataSourceFromEnv} from '../../vendor/gildata/client';
import {supabaseVendorRawStore} from '../../vendor/raw-store';
import {supabaseVendorIndustryDb} from './db';
import {byIndexCode} from './sw2021-gildata-codes';
import {runGildataFinancials,runGildataMemberships,type VendorDeps,type VendorOptions} from './ingest';
import {fixtureDirSource} from './fixtures-dir';
import type {Mode} from './types';

export const VENDOR_JOBS=['gildata-memberships','gildata-industry-financials'] as const;
type Job=typeof VENDOR_JOBS[number];
type Env=Record<string,string|undefined>;
export const isVendorJob=(value:string):value is Job=>VENDOR_JOBS.some(job=>job===value);
export function vendorJobGate(_job:Job,env:Env,{mode,fixtures}:{mode:Mode;fixtures?:string|boolean}){
 if(mode==='apply'&&env.INDUSTRY_CN_VENDOR_ENABLED!=='1')return {code:'job_disabled',message:'Vendor apply is disabled'} as const;
 if(mode!=='plan'&&!fixtures&&!env.GILDATA_API_KEY?.trim())return {code:'gildata_unavailable',message:'Gildata unavailable'} as const;
 return null;
}
export function runVendorJob(job:Job,deps:VendorDeps,opts:VendorOptions){
 return job==='gildata-memberships'?runGildataMemberships(deps,opts):runGildataFinancials(deps,opts);
}
export function productionVendorDeps({codeVersion,mode,env,fixtures}:{codeVersion:string|null;mode:Mode;env:Env;fixtures?:string}):VendorDeps{
 const source=mode==='plan'?null:fixtures?fixtureDirSource(fixtures):gildataSourceFromEnv(env);
 const base={codeVersion,source,now:()=>new Date()};
 if(mode!=='apply')return base;
 const admin=getAdminSupabase();
 return {...base,db:supabaseVendorIndustryDb(admin),tables:supabaseTableClient(admin),raw:supabaseVendorRawStore(admin)};
}
export function parseVendorSyncArgs(argv:string[]){
 let job:Job|undefined,mode:Mode='dry-run',fixtures:string|undefined,fromYear:number|undefined,toYear:number|undefined;
 const seen=new Set<string>(),l1Codes:string[]=[];
 const bad=():never=>{throw Error('invalid_arguments');};
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(seen.has(flag)&&flag!=='--l1')bad();seen.add(flag);
  if(flag==='--plan'||flag==='--apply'){
   if(mode!=='dry-run')bad();
   mode=flag==='--plan'?'plan':'apply';continue;
  }
  const value=argv[++i];if(!value||value.startsWith('--'))bad();
  switch(flag){
   case '--job':if(!isVendorJob(value))return bad();job=value;break;
   case '--fixtures':fixtures=value;break;
   case '--l1':if(!byIndexCode(value)||l1Codes.includes(value))bad();l1Codes.push(value);break;
   case '--from-year':case '--to-year':{
    const year=Number(value);if(!/^\d{4}$/.test(value)||year<2016||year>2100)bad();
    if(flag==='--from-year')fromYear=year;else toYear=year;break;
   }
   default:bad();
  }
 }
 if(!job||(job==='gildata-memberships'&&(fromYear!==undefined||toYear!==undefined))||(fromYear??2016)>(toYear??2100))return bad();
 return {job,mode,fixtures,fromYear,toYear,l1Codes:l1Codes.length?l1Codes:undefined};
}
