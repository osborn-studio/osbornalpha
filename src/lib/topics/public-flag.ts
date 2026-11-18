import 'server-only';
import {unstable_cache} from 'next/cache';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTopicsDb} from './db';
import {fixtureMode} from './e2e-fixture';
import {topicsEnabled} from './flags';

export function createTopicsPublicEnabledReader(
 configured:()=>boolean,
 read:()=>Promise<{public_enabled:boolean}|null>,
){
 return async()=>{
  try{return configured() && (await read())?.public_enabled===true;}
  catch{return false;}
 };
}
const cachedRead=unstable_cache(createTopicsPublicEnabledReader(
 ()=>Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
 ()=>supabaseTopicsDb({admin:getAdminSupabase()}).settings(),
),['topics-public-enabled'],{revalidate:60});

export function createTopicsPublicFlag(
 fixture:()=>boolean,
 enabled:()=>boolean,
 cached:()=>Promise<boolean>,
):()=>Promise<boolean>{
 return async()=>{
  try{
   if(fixture())return true;
   if(!enabled())return false;
   return await cached();
  }catch{return false;}
 };
}

export const readTopicsPublicEnabled=createTopicsPublicFlag(fixtureMode,topicsEnabled,cachedRead);
