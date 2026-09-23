import {openSync,readSync,closeSync,fstatSync,constants} from 'node:fs';
import {MAX_JSON_BYTES,fail} from '../../src/lib/research/ingest/pa-v1/json.js';
/** Read a bounded regular file; reject a final-component symlink and nonblocking special files. */
export function readMarketFile(path:string){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  if(!fstatSync(fd).isFile())fail('invalid_file');
  const buffer=Buffer.alloc(MAX_JSON_BYTES+1);let length=0;
  while(length<buffer.length){const n=readSync(fd,buffer,length,buffer.length-length,null);if(!n)break;length+=n;}
  if(length>MAX_JSON_BYTES)fail('input_limit');return buffer.subarray(0,length);
 }finally{closeSync(fd);}
}
export function printMarketError(error:unknown,schema_version:string){
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'invalid_input';
 const inputCodes=new Set(['invalid_schema','input_limit','duplicate_key','future_input','rule_unsupported','hash_mismatch','data_insufficient','invalid_timeline','split_factor_mismatch','market_identity_mismatch','pair_mismatch']);
 const invalid=inputCodes.has(code);
 const leg=error&&typeof error==='object'&&'leg' in error&&['target','benchmark'].includes(String(error.leg))?String(error.leg):undefined;
 console.log(JSON.stringify({schema_version,status:invalid?'invalid':'error',code,...(leg?{leg}:{}),accepted_for_evaluation:false}));process.exitCode=invalid?1:3;
}
