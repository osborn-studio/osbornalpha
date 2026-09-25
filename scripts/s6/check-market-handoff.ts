/** Offline file checker: 0 structurally complete, 2 incomplete, 1 invalid, 3 tool/I/O error.
 * Exit 0 never grants rights or admits real data into the evaluation engine. */
import {validateMarketHandoff} from '../../src/lib/research/s6/market-handoff';
import {fail} from '../../src/lib/research/ingest/pa-v1/json.js';
import {readMarketFile,printMarketError} from './market-file';
try{
 if(process.argv.length!==3)fail('usage: tsx scripts/s6/check-market-handoff.ts <bundle.json>');
 const result=validateMarketHandoff(readMarketFile(process.argv[2]));
 console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='contract_valid'?0:2;
}catch(error){printMarketError(error,'alpha-market-handoff-check/1.0');}
