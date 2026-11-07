/** Offline source replay; no network, credentials, database reads or writes.
 * node --import tsx scripts/company/replay-evidence.ts <facts-response.json> <fact-id> <snapshot.json>
 * Exit 0 = source/value replay verified; 1 = rejected; 2 = usage/file/JSON error.
 */
import {readFileSync} from 'node:fs';
import {replayCompanyEvidence} from '../../src/lib/company/replay-evidence';

const args=process.argv.slice(2);
if(args.length!==3||args.some(x=>x.startsWith('--'))){
 console.error('usage: replay-evidence.ts <facts-response.json> <fact-id> <snapshot.json>');
 process.exit(2);
}
try{
 const [responsePath,factId,snapshotPath]=args;
 const result=replayCompanyEvidence(JSON.parse(readFileSync(responsePath,'utf8')),factId,new Uint8Array(readFileSync(snapshotPath)));
 console.log(JSON.stringify(result));
 process.exitCode=result.status==='source_replay_verified'?0:1;
}catch{
 // File paths, saved JSON and upstream error bodies may contain private data.
 console.error('replay_input_read_failed');
 process.exitCode=2;
}
