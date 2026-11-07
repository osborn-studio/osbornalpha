// Private broker research bucket and validated object layout (spec §4.12, §6.1). Uploads never overwrite;
// signed reads are issued by an admin route after a durable access log entry.
import type {SupabaseClient} from '@supabase/supabase-js';

export const BROKER_BUCKET='broker-research';
export const MAX_OBJECT_BYTES=52428800;
export const SIGNED_READ_SECONDS=600;
export type ObjectType='application/pdf'|'application/json'|'image/png';
const U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',S='[0-9a-f]{64}';
const PATH_RE=new RegExp(`^(staging/${U}\\.pdf|reports/${S}\\.pdf|reports/${S}\\.extract\\.${U}\\.json|reports/${S}\\.pages\\.${U}/[1-9][0-9]{0,4}\\.png|runs/${U}\\.(request|response)\\.json|eval/${S}/${U}\\.(request|response)\\.json|licences/${S}\\.pdf)$`);
const PREFIX_RE=new RegExp(`^(staging/|reports/${S}\\.pages\\.${U}/|eval/${S}/)$`);
export const brokerPaths={
 staging:(intentId:string)=>`staging/${intentId}.pdf`,report:(sha:string)=>`reports/${sha}.pdf`,
 artifact:(sha:string,runId:string)=>`reports/${sha}.extract.${runId}.json`,
 artifactPrefix:(sha:string,runId:string)=>`reports/${sha}.extract.${runId}`,
 pagesPrefix:(sha:string,runId:string)=>`reports/${sha}.pages.${runId}/`,
 request:(runId:string)=>`runs/${runId}.request.json`,response:(runId:string)=>`runs/${runId}.response.json`,
 evalRequest:(sha:string,runId:string)=>`eval/${sha}/${runId}.request.json`,
 evalResponse:(sha:string,runId:string)=>`eval/${sha}/${runId}.response.json`,evalPrefix:(sha:string)=>`eval/${sha}/`,
};
export class StorageError extends Error{
 constructor(readonly code:'storage_failed'|'storage_invalid_path'|'storage_not_found',message?:string){super(message??code);this.name='StorageError';}
}
export function assertObjectPath(p:string):void{if(typeof p!=='string'||!PATH_RE.test(p))throw new StorageError('storage_invalid_path',String(p).slice(0,120));}
function assertPrefix(p:string):void{if(typeof p!=='string'||!PREFIX_RE.test(p))throw new StorageError('storage_invalid_path',String(p).slice(0,120));}
export interface BrokerStorage{
 createSignedUploadUrl(path:string):Promise<{url:string;token:string}>;
 download(path:string):Promise<Uint8Array|null>;
 upload(path:string,body:Uint8Array|string,contentType:ObjectType):Promise<'stored'|'exists'>;
 move(from:string,to:string):Promise<'moved'|'missing'|'target_exists'>;
 exists(path:string):Promise<boolean>;
 remove(paths:string[]):Promise<void>;
 createSignedUrl(path:string,expiresIn:number):Promise<string>;
 list(prefix:string):Promise<string[]>;
}
interface SbError{message:string;statusCode?:string|number;status?:number}
const statusOf=(e:SbError)=>String(e.statusCode??e.status??'');
const isNotFound=(e:SbError)=>statusOf(e)==='404'||/not.?found/i.test(e.message);
const isExists=(e:SbError)=>statusOf(e)==='409'||/already exists|duplicate/i.test(e.message);
export function supabaseBrokerStorage(admin:SupabaseClient):BrokerStorage{
 const b=()=>admin.storage.from(BROKER_BUCKET);
 const fail=(op:string,e:SbError|null)=>new StorageError('storage_failed',`${op}:${e?.message??'no_data'}`);
 return {
  async createSignedUploadUrl(path){assertObjectPath(path);const {data,error}=await b().createSignedUploadUrl(path);if(error||!data)throw fail('signed_upload',error as SbError|null);return {url:data.signedUrl,token:data.token};},
  async download(path){assertObjectPath(path);const {data,error}=await b().download(path);if(error){if(isNotFound(error as SbError))return null;throw fail('download',error as SbError);}return new Uint8Array(await data.arrayBuffer());},
  async upload(path,body,contentType){assertObjectPath(path);const {error}=await b().upload(path,body,{contentType,upsert:false});if(!error)return 'stored';if(isExists(error as SbError))return 'exists';throw fail('upload',error as SbError);},
  async move(from,to){assertObjectPath(from);assertObjectPath(to);const {error}=await b().move(from,to);if(!error)return 'moved';if(isExists(error as SbError))return 'target_exists';if(isNotFound(error as SbError))return 'missing';throw fail('move',error as SbError);},
  async exists(path){assertObjectPath(path);const {data,error}=await b().exists(path);if(error&&!isNotFound(error as SbError))throw fail('exists',error as SbError);return data===true;},
  async remove(paths){paths.forEach(assertObjectPath);if(!paths.length)return;const {error}=await b().remove(paths);if(error)throw fail('remove',error as SbError);},
  async createSignedUrl(path,expiresIn){assertObjectPath(path);const {data,error}=await b().createSignedUrl(path,expiresIn);if(error||!data)throw fail('signed_url',error as SbError|null);return data.signedUrl;},
  async list(prefix){assertPrefix(prefix);const out:string[]=[];for(let offset=0;;offset+=1000){
   const {data,error}=await b().list(prefix.slice(0,-1),{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
   if(error)throw fail('list',error as SbError);
   for(const o of data??[])if(o.id!==null)out.push(prefix+o.name);
   if(!data||data.length<1000)return out;
  }},
 };
}
export interface MemoryBrokerStorage extends BrokerStorage{
 objects:Map<string,{bytes:Uint8Array;contentType:string}>;
 putSigned(path:string,token:string,bytes:Uint8Array):'stored'|'rejected';
 failNext(op:keyof BrokerStorage,message?:string):void;
 read(path:string):Uint8Array|undefined;text(path:string):string|undefined;
}
export function memoryBrokerStorage():MemoryBrokerStorage{
 const objects=new Map<string,{bytes:Uint8Array;contentType:string}>(),signed=new Map<string,string>(),failures=new Map<string,string>();let n=0;
 const guard=(op:string)=>{const m=failures.get(op);if(m!==undefined){failures.delete(op);throw new StorageError('storage_failed',`${op}:${m}`);}};
 const bytesOf=(b:Uint8Array|string)=>typeof b==='string'?new TextEncoder().encode(b):new Uint8Array(b);
 return {objects,
  putSigned(path,token,bytes){assertObjectPath(path);if(signed.get(path)!==token||objects.has(path)||bytes.byteLength>MAX_OBJECT_BYTES)return 'rejected';objects.set(path,{bytes:new Uint8Array(bytes),contentType:'application/pdf'});signed.delete(path);return 'stored';},
  failNext(op,message='injected'){failures.set(op,message);},
  read:(p)=>{const o=objects.get(p);return o?new Uint8Array(o.bytes):undefined;},text:(p)=>{const o=objects.get(p);return o?new TextDecoder().decode(o.bytes):undefined;},
  async createSignedUploadUrl(path){guard('createSignedUploadUrl');assertObjectPath(path);const token=`tok-${++n}`;signed.set(path,token);return {url:`memory://upload/${path}?token=${token}`,token};},
  async download(path){guard('download');assertObjectPath(path);const o=objects.get(path);return o?new Uint8Array(o.bytes):null;},
  async upload(path,body,contentType){guard('upload');assertObjectPath(path);if(objects.has(path))return 'exists';const bytes=bytesOf(body);if(bytes.byteLength>MAX_OBJECT_BYTES)throw new StorageError('storage_failed','upload:too_large');objects.set(path,{bytes,contentType});return 'stored';},
  async move(from,to){guard('move');assertObjectPath(from);assertObjectPath(to);const o=objects.get(from);if(!o)return 'missing';if(objects.has(to))return 'target_exists';objects.set(to,o);objects.delete(from);return 'moved';},
  async exists(path){guard('exists');assertObjectPath(path);return objects.has(path);},
  async remove(paths){guard('remove');paths.forEach(assertObjectPath);for(const p of paths)objects.delete(p);},
  async createSignedUrl(path,expiresIn){guard('createSignedUrl');assertObjectPath(path);if(!objects.has(path))throw new StorageError('storage_not_found',path);return `memory://read/${path}?expires=${expiresIn}`;},
  async list(prefix){guard('list');assertPrefix(prefix);return [...objects.keys()].filter(k=>k.startsWith(prefix)&&!k.slice(prefix.length).includes('/')).sort();},
 };
}
