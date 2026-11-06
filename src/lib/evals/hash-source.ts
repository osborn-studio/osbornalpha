// src/lib/evals/hash-source.ts
// Recording helper for §4.6 `source.sha256`: fetch a primary document and return the sha256 and
// byte length of exactly the bytes served. Nothing is written anywhere (the official archives keep
// the document; the hash lets anyone confirm they read the same bytes). SEC requires a declared
// User-Agent: EDGAR_USER_AGENT, else the research collectors' DEFAULT_USER_AGENT.
import {sha256Hex} from './canonical-json';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';

export interface HashedSource{url:string;sha256:string;bytes:number;status:number}
export async function hashSource(url:string,opts:{fetch?:typeof fetch;userAgent?:string}={}):Promise<HashedSource>{
 let parsed:URL;
 try{parsed=new URL(url);}catch{throw new Error('invalid_url');}
 if(parsed.protocol!=='https:')throw new Error('https_required');
 const res=await (opts.fetch??fetch)(parsed.toString(),{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,'Accept':'*/*'},redirect:'follow'});
 if(!res.ok)throw new Error(`http_${res.status}`);
 const body=new Uint8Array(await res.arrayBuffer());
 return {url:parsed.toString(),sha256:sha256Hex(body),bytes:body.byteLength,status:res.status};
}
