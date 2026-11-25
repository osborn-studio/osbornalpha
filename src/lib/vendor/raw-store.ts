// Immutable content-addressed vendor evidence. Both storage boundaries check the digest.
import type {SupabaseClient} from '@supabase/supabase-js';
import {sha256Hex} from '../facts/providers/shared';
export const VENDOR_RAW_BUCKET='vendor-raw';
interface RawObject{vendor:string;sha256:string;bytes:Uint8Array;contentType:string}
export interface VendorRawStore{
 put(o:RawObject):Promise<'stored'|'exists'>;
 get(vendor:string,sha256:string):Promise<Uint8Array>;
}
export function vendorRawPath(vendor:string,sha256:string):string{
 if(!/^[a-z][a-z0-9-]{0,31}$/.test(vendor)||!/^[0-9a-f]{64}$/i.test(sha256))throw Error('vendor_raw_invalid_path');
 return `${vendor}/${sha256}.json`;
}
function verify(bytes:Uint8Array,sha256:string){
 if(sha256Hex(bytes)!==sha256.toLowerCase())throw Error('vendor_raw_hash_mismatch');
 return bytes;
}
export function memoryVendorRawStore():VendorRawStore{
 const objects=new Map<string,Uint8Array>();
 return {
  async put({vendor,sha256,bytes}){
   const path=vendorRawPath(vendor,sha256);
   verify(bytes,sha256);
   if(objects.has(path))return 'exists';
   objects.set(path,new Uint8Array(bytes));return 'stored';
  },
  async get(vendor,sha256){
   const bytes=objects.get(vendorRawPath(vendor,sha256));
   if(!bytes)throw Error('vendor_raw_download_failed');
   return new Uint8Array(verify(bytes,sha256));
  },
 };
}
export function supabaseVendorRawStore(admin:SupabaseClient):VendorRawStore{
 const bucket=()=>admin.storage.from(VENDOR_RAW_BUCKET);
 return {
  async put({vendor,sha256,bytes,contentType}){
   const path=vendorRawPath(vendor,sha256);
   const body=verify(new Uint8Array(bytes),sha256);
   const {error}=await bucket().upload(path,body,{contentType,upsert:false});
   if(!error)return 'stored';
   const e=error as {statusCode?:string|number;status?:number;message:string};
   if(String(e.statusCode??e.status)==='409'||/already exists|duplicate/i.test(e.message))return 'exists';
   throw Error('vendor_raw_upload_failed');
  },
  async get(vendor,sha256){
   const {error,data}=await bucket().download(vendorRawPath(vendor,sha256));
   if(error||!data)throw Error('vendor_raw_download_failed');
   return verify(new Uint8Array(await data.arrayBuffer()),sha256);
  },
 };
}
