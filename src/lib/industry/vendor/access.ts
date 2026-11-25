import {VENDOR_DATASET_KEYS} from './types';
export type VendorAccess='preview'|'withheld';
export async function vendorAccess(deps:{isAdmin:()=>Promise<boolean>;licenceStatus:(key:string)=>Promise<string|null>}):Promise<VendorAccess>{
 try{
  for(const key of ['scheme:sw2021:2021',...VENDOR_DATASET_KEYS]){
   const status=await deps.licenceStatus(key);
   if(status!=='internal'&&status!=='public')return 'withheld';
  }
  return await deps.isAdmin()?'preview':'withheld';
 }catch{return 'withheld';}
}
