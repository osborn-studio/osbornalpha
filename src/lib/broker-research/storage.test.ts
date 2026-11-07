// Storage port contract for the private broker research bucket (spec §4.12).
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {BROKER_BUCKET,StorageError,brokerPaths,memoryBrokerStorage,supabaseBrokerStorage} from './storage';

const SHA='a'.repeat(64),ID='00000000-0000-4000-8000-000000000001';
const pdf=new TextEncoder().encode('%PDF-1.7 synthetic');

describe('memoryBrokerStorage',()=>{
 it('signed upload accepts exactly one upload for the issued token',async()=>{
  const s=memoryBrokerStorage();const {token}=await s.createSignedUploadUrl(brokerPaths.staging(ID));
  expect(s.putSigned(brokerPaths.staging(ID),'wrong',pdf)).toBe('rejected');
  expect(s.putSigned(brokerPaths.staging(ID),token,pdf)).toBe('stored');
  expect(s.putSigned(brokerPaths.staging(ID),token,pdf)).toBe('rejected');
 });
 it('upload never overwrites',async()=>{
  const s=memoryBrokerStorage();const p=brokerPaths.artifact(SHA,ID);
  expect(await s.upload(p,'{"a":1}','application/json')).toBe('stored');
  expect(await s.upload(p,'{"a":2}','application/json')).toBe('exists');
  expect(s.text(p)).toBe('{"a":1}');
 });
 it('move distinguishes moved / missing / target_exists',async()=>{
  const s=memoryBrokerStorage();const st=brokerPaths.staging(ID),rp=brokerPaths.report(SHA);
  expect(await s.move(st,rp)).toBe('missing');
  await s.upload(st,pdf,'application/pdf');expect(await s.move(st,rp)).toBe('moved');
  expect(await s.exists(st)).toBe(false);expect(await s.exists(rp)).toBe(true);
  await s.upload(st,pdf,'application/pdf');expect(await s.move(st,rp)).toBe('target_exists');
 });
 it('remove is idempotent, list is one level under the prefix',async()=>{
  const s=memoryBrokerStorage();await s.upload(brokerPaths.staging(ID),pdf,'application/pdf');
  await s.upload(`${brokerPaths.pagesPrefix(SHA,ID)}1.png`,pdf,'image/png');
  expect(await s.list('staging/')).toEqual([brokerPaths.staging(ID)]);
  expect(await s.list(brokerPaths.pagesPrefix(SHA,ID))).toEqual([`${brokerPaths.pagesPrefix(SHA,ID)}1.png`]);
  await s.remove([brokerPaths.staging(ID)]);await s.remove([brokerPaths.staging(ID)]);
  expect(await s.list('staging/')).toEqual([]);
 });
 it('rejects paths outside the bucket layout',async()=>{
  const s=memoryBrokerStorage();
  await expect(s.upload('reports/../x.pdf',pdf,'application/pdf')).rejects.toMatchObject({code:'storage_invalid_path'});
  await expect(s.list('reports/')).rejects.toBeInstanceOf(StorageError);
 });
 it('signed read URL needs an existing object; failNext injects one failure',async()=>{
  const s=memoryBrokerStorage();await expect(s.createSignedUrl(brokerPaths.report(SHA),600)).rejects.toMatchObject({code:'storage_not_found'});
  s.failNext('download');await expect(s.download(brokerPaths.report(SHA))).rejects.toMatchObject({code:'storage_failed'});
  expect(await s.download(brokerPaths.report(SHA))).toBeNull();
 });
});

describe('supabaseBrokerStorage',()=>{
 const client=(api:Record<string,unknown>)=>({storage:{from:vi.fn((b:string)=>{expect(b).toBe(BROKER_BUCKET);return api;})}}) as unknown as SupabaseClient;
 it('maps not-found download to null and 409 upload to exists',async()=>{
  const s=supabaseBrokerStorage(client({download:async()=>({data:null,error:{message:'Object not found',statusCode:'404'}}),upload:async()=>({data:null,error:{message:'The resource already exists',statusCode:'409'}})}));
  expect(await s.download(brokerPaths.report(SHA))).toBeNull();expect(await s.upload(brokerPaths.report(SHA),pdf,'application/pdf')).toBe('exists');
 });
 it('maps move errors and passes upsert:false',async()=>{
  const upload=vi.fn(async()=>({data:{},error:null}));
  const move=vi.fn().mockResolvedValueOnce({error:{message:'Object not found',statusCode:'404'}}).mockResolvedValueOnce({error:{message:'The resource already exists',statusCode:'409'}}).mockResolvedValueOnce({error:null});
  const s=supabaseBrokerStorage(client({move,upload}));
  expect(await s.move(brokerPaths.staging(ID),brokerPaths.report(SHA))).toBe('missing');
  expect(await s.move(brokerPaths.staging(ID),brokerPaths.report(SHA))).toBe('target_exists');
  expect(await s.move(brokerPaths.staging(ID),brokerPaths.report(SHA))).toBe('moved');
  await s.upload(brokerPaths.report(SHA),pdf,'application/pdf');
  expect(upload).toHaveBeenCalledWith(brokerPaths.report(SHA),pdf,{contentType:'application/pdf',upsert:false});
 });
 it('throws storage_failed for other errors and pages list()',async()=>{
  const page=(n:number,from:number)=>Array.from({length:n},(_,i)=>({id:`x${from+i}`,name:`${from+i+1}.png`}));
  const list=vi.fn().mockResolvedValueOnce({data:page(1000,0),error:null}).mockResolvedValueOnce({data:page(2,1000),error:null});
  const s=supabaseBrokerStorage(client({list,remove:async()=>({error:{message:'boom',statusCode:'500'}})}));
  expect((await s.list(brokerPaths.pagesPrefix(SHA,ID))).length).toBe(1002);
  expect(list.mock.calls[1][1]).toMatchObject({limit:1000,offset:1000});
  await expect(s.remove([brokerPaths.report(SHA)])).rejects.toMatchObject({code:'storage_failed'});
 });
});
