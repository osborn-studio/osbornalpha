// Decode JSON-RPC and the nested tool result. Hash sorted pairs, retain original block indices.
import {sha256Hex} from '../../facts/providers/shared';
export class GildataParseError extends Error{
 constructor(public readonly outcome:'parse_failed'|'request_mismatch',public readonly reason:string){
  super(`${outcome}: ${reason}`);this.name='GildataParseError';
 }
}
function failed(reason:string):never{throw new GildataParseError('parse_failed',reason);}
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function decodeGildataBody(bytes:Uint8Array){
 let rpc:unknown,inner:unknown;
 try{rpc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failed('not_json');}
 if(!record(rpc)||rpc.jsonrpc!=='2.0'||'error' in rpc)return failed('rpc_error');
 if(!record(rpc.result)||rpc.result.isError!==false)return failed('tool_error');
 const parts=rpc.result.content;
 if(!Array.isArray(parts)||parts.length!==1||!record(parts[0])||parts[0].type!=='text'||typeof parts[0].text!=='string')return failed('unexpected_content');
 try{inner=JSON.parse(parts[0].text);}catch{return failed('inner_not_json');}
 if(!record(inner))return failed('unexpected_result_shape');
 if(inner.code!==0)return failed('vendor_code_nonzero');
 if(!Array.isArray(inner.results)||('message' in inner&&typeof inner.message!=='string'))return failed('unexpected_result_shape');
 const blocks=inner.results.map((r:unknown)=>{
  if(!record(r)||typeof r.api_name!=='string'||typeof r.table_markdown!=='string'||Object.keys(r).length!==2)return failed('unexpected_result_shape');
  return {apiName:r.api_name,tableMarkdown:r.table_markdown};
 });
 const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const pairs=blocks.map(b=>[b.apiName,b.tableMarkdown]).sort(([a,x],[b,y])=>compare(a,b)||compare(x,y));
 return {blocks,message:typeof inner.message==='string'?inner.message:null,canonicalSha256:sha256Hex(JSON.stringify(pairs))};
}
