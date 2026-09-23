/** Offline file checker: exit 0 structurally complete, 2 incomplete, 1 invalid, 3 tool/I/O error.
 * Exit 0 never grants rights or admits real data into the evaluation engine. */
import {openSync,readSync,closeSync,fstatSync,constants} from 'node:fs';
import {validateMarketHandoff} from '../../src/lib/research/s6/market-handoff';
import {MAX_JSON_BYTES,fail} from '../../src/lib/research/ingest/pa-v1/json.js';
try {
 if(process.argv.length!==3)fail('usage: tsx scripts/s6/check-market-handoff.ts <bundle.json>');
 const fd=openSync(process.argv[2],constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 let raw:Buffer;
 try {
  if(!fstatSync(fd).isFile())fail('invalid_file');
  const buffer=Buffer.alloc(MAX_JSON_BYTES+1);let length=0;
  while(length<buffer.length){const n=readSync(fd,buffer,length,buffer.length-length,null);if(!n)break;length+=n;}
  if(length>MAX_JSON_BYTES)fail('input_limit');raw=buffer.subarray(0,length);
 }finally{closeSync(fd);}
 const result=validateMarketHandoff(raw);
 console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='contract_valid'?0:2;
}catch(error){
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'invalid_input';
 const inputCodes=new Set(['invalid_schema','input_limit','duplicate_key','future_input','rule_unsupported','hash_mismatch','data_insufficient','invalid_timeline','split_factor_mismatch']);
 const invalid=inputCodes.has(code);
 console.log(JSON.stringify({schema_version:'alpha-market-handoff-check/1.0',status:invalid?'invalid':'error',code,accepted_for_evaluation:false}));process.exitCode=invalid?1:3;
}
