import 'server-only';
import {unstable_cache} from 'next/cache';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseBrokerResearchDb} from './db';

/** Inject configuration and the settings read without exposing a server dependency to clients. */
export function createForeignPublicEnabledReader(
 configured:()=>boolean,
 read:()=>Promise<{public_enabled:boolean}|null>,
):()=>Promise<boolean>{
 return async()=>{try{return configured()&&(await read())?.public_enabled===true;}catch{return false;}};
}
const cachedRead=unstable_cache(createForeignPublicEnabledReader(
 ()=>Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),
 ()=>supabaseBrokerResearchDb({admin:getAdminSupabase()}).getSettings(),
),['foreign-public-enabled'],{revalidate:60});
export async function readForeignPublicEnabled():Promise<boolean>{
 try{return await cachedRead();}catch{return false;}
}
