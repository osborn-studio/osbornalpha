// The outer and inner JSON contracts fail closed without echoing vendor text.
import {expect,it} from 'vitest';
import {decodeGildataBody} from './envelope';
import {sha256Hex} from '../../facts/providers/shared';
const encode=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));
const rpc=(text:string)=>({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text}],isError:false}});
const inner=(results:unknown)=>rpc(JSON.stringify({code:0,results}));
it.each([
 ['not_json',new Uint8Array([0xff])],['not_json',new TextEncoder().encode('{')],
 ['rpc_error',encode({...rpc('{}'),error:null})],['rpc_error',encode({...rpc('{}'),jsonrpc:'1.0'})],
 ['tool_error',encode({jsonrpc:'2.0',result:{isError:true}})],
 ['unexpected_content',encode({jsonrpc:'2.0',result:{isError:false,content:[]}})],
 ['inner_not_json',encode(rpc('broken'))],['vendor_code_nonzero',encode(rpc('{"code":1}'))],
 ['unexpected_result_shape',encode(inner(null))],['unexpected_result_shape',encode(inner([{api_name:'a',table_markdown:'b',extra:true}]))],
] as const)('classifies %s',(reason,bytes)=>{
 expect(()=>decodeGildataBody(bytes)).toThrow(expect.objectContaining({reason,outcome:'parse_failed'}));
});
it('hashes sorted pairs while preserving wire order for locators',()=>{
 const blocks=['b','a','a'].map((api_name,i)=>({api_name,table_markdown:String(2-i)}));
 const decode=(rows:typeof blocks)=>decodeGildataBody(encode(inner(rows)));
 expect(decode(blocks).canonicalSha256).toBe(sha256Hex(JSON.stringify([['a','0'],['a','1'],['b','2']])));
 expect(decode([...blocks].reverse()).canonicalSha256).toBe(decode(blocks).canonicalSha256);
 expect(decode(blocks.slice(1)).canonicalSha256).not.toBe(decode(blocks).canonicalSha256);
 expect(decode(blocks).blocks[0]).toEqual({apiName:'b',tableMarkdown:'2'});
});
