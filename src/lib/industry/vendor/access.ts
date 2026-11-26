import {VENDOR_DATASET_KEYS} from './types';
export type VendorAccess='public'|'preview'|'withheld';
export async function vendorAccess(deps:{isSignedIn:()=>Promise<boolean>;isAdmin:()=>Promise<boolean>;licenceStatus:(key:string)=>Promise<string|null>}):Promise<VendorAccess>{
 try{
  let allPublic=true;
  for(const key of ['scheme:sw2021:2021',...VENDOR_DATASET_KEYS]){
   const status=await deps.licenceStatus(key);
   if(status!=='internal'&&status!=='public')return 'withheld';
   if(status==='internal')allPublic=false;
  }
  if(allPublic)return await deps.isSignedIn()?'public':'withheld';
  return await deps.isAdmin()?'preview':'withheld';
 }catch{return 'withheld';}
}
