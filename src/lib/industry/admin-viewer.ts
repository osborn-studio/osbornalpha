import {getServerSupabase} from '../supabase/server';
import {requireAdminUser} from '../admin/auth';

export async function isAdminViewer():Promise<boolean>{try{await requireAdminUser();return true;}catch{return false;}}

export async function isSignedInViewer():Promise<boolean>{
 try{
  const {data,error}=await (await getServerSupabase()).auth.getUser();
  return !error&&!!data.user;
 }catch{return false;}
}
