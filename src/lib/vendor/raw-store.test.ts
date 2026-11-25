// Raw storage validates content addresses on both sides of the storage boundary.
import {it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {sha256Hex} from '../facts/providers/shared';
import {memoryVendorRawStore,supabaseVendorRawStore,vendorRawPath} from './raw-store';
const bytes=new Uint8Array([0,255,65]),sha256=sha256Hex(bytes),vendor='gildata',contentType='application/json';
it('copies evidence on write and read and refuses inconsistent bytes',async()=>{
 const store=memoryVendorRawStore(),input={vendor,sha256,bytes:bytes.slice(),contentType};
 expect(await store.put(input)).toBe('stored');
 expect(await store.put(input)).toBe('exists');
 input.bytes.fill(0);
 await expect(store.put(input)).rejects.toThrow('vendor_raw_hash_mismatch');
 (await store.get(vendor,sha256)).fill(0);
 expect(await store.get(vendor,sha256)).toEqual(bytes);
});
it('accepts only one vendor segment and a hex digest',()=>{
 expect(vendorRawPath(vendor,sha256)).toBe(`gildata/${sha256}.json`);
 for(const v of ['../x','A','1vendor','a'.repeat(33)])expect(()=>vendorRawPath(v,sha256)).toThrow();
 expect(()=>vendorRawPath(vendor,'a')).toThrow();
});
it('uploads once, recognizes conflicts and verifies downloaded bytes',async()=>{
 const upload=vi.fn(),download=vi.fn(),from=vi.fn(()=>({upload,download}));
 const store=supabaseVendorRawStore({storage:{from}} as unknown as SupabaseClient);
 const input={vendor,sha256,bytes,contentType};
 for(const [error,result] of [[null,'stored'],[{statusCode:'409'},'exists'],[{message:'already exists'},'exists']] as const){
  upload.mockResolvedValueOnce({error});
  expect(await store.put(input)).toBe(result);
 }
 expect(from).toHaveBeenCalledWith('vendor-raw');
 expect(upload).toHaveBeenCalledWith(vendorRawPath(vendor,sha256),bytes,{upsert:false,contentType});
 upload.mockResolvedValueOnce({error:{message:'failure'}});
 await expect(store.put(input)).rejects.toThrow();
 download.mockResolvedValueOnce({data:new Blob([bytes]),error:null});
 expect(await store.get(vendor,sha256)).toEqual(bytes);
 download.mockResolvedValueOnce({data:new Blob([]),error:null});
 await expect(store.get(vendor,sha256)).rejects.toThrow('vendor_raw_hash_mismatch');
});
