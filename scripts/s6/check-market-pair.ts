/** Offline target + SPY conformance: 0 complete, 2 incomplete, 1 invalid, 3 I/O. */
import {validateMarketPair} from '../../src/lib/research/s6/market-pair';
import {fail} from '../../src/lib/research/ingest/pa-v1/json.js';
import {readMarketFile,printMarketError} from './market-file';
try{
 if(process.argv.length!==4)fail('usage: tsx scripts/s6/check-market-pair.ts <target.json> <spy.json>');
 let target:Buffer,benchmark:Buffer;
 try{target=readMarketFile(process.argv[2]);}catch(error){if(error&&typeof error==='object')Object.assign(error,{leg:'target'});throw error;}
 try{benchmark=readMarketFile(process.argv[3]);}catch(error){if(error&&typeof error==='object')Object.assign(error,{leg:'benchmark'});throw error;}
 const result=validateMarketPair(target,benchmark);
 console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='contract_valid'?0:2;
}catch(error){printMarketError(error,'alpha-market-pair-check/1.0');}
