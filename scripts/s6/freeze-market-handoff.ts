/** Operator-only: freeze one alpha-market-handoff/1.0 bundle (target or SPY leg) onto a 2.0 observation.
 *   npx tsx scripts/s6/freeze-market-handoff.ts <state.json> <owner-uuid> <observation-id> <bundle.json> [--id ID]
 * Isolated local database only. Identity must be covered by docs/handoffs/alpha-s6/identity-attestations.json;
 * registered synthetic observations only; no real-market activation. */
import {readFileSync,realpathSync} from 'node:fs';
import {basename,dirname} from 'node:path';
import {revocationHttpError} from '../../src/lib/research/revocation/http-error';
import {fail} from '../../src/lib/research/ingest/pa-v1/json.js';
import {readMarketFile,printMarketError} from './market-file';
import {freezeRegisteredMarketHandoff} from '../../src/lib/research/s6/market';
import {closeS4Pool} from '../../src/lib/research/s4/db';
const args=process.argv.slice(2);
const idIndex=args.indexOf('--id'),id=idIndex>=0?args[idIndex+1]:undefined;
// Only the flag and its value are non-positional; with no --id every argument is positional.
const positional=args.filter((_,i)=>idIndex<0||(i!==idIndex&&i!==idIndex+1));
async function main(){
 if(positional.length!==4)fail('usage: tsx scripts/s6/freeze-market-handoff.ts <state.json> <owner-uuid> <observation-id> <bundle.json> [--id ID]');
 const [statePath,owner,observationId,bundlePath]=positional;
 const state=JSON.parse(readFileSync(statePath,'utf8'));
 try{
  const admin=new URL(state.adminUrl),runtime=new URL(state.runtimeUrl);
  if([admin,runtime].some(u=>!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||u.search||u.hash||!u.port||u.pathname!=='/postgres')||admin.port!==runtime.port||admin.username!=='s4_admin'||runtime.username!=='s4_app'||!basename(state.directory).startsWith('alpha-s4-db-')||realpathSync(dirname(statePath))!==realpathSync(state.directory))fail('local_acceptance_only');
 }catch{fail('local_acceptance_only');}
 if(idIndex>=0&&(!id||id.startsWith('--')))fail('invalid_schema');
 Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
 const raw=readMarketFile(bundlePath).toString('utf8');
 const result=await freezeRegisteredMarketHandoff({userId:owner,kind:'agent'},observationId,{raw,id});
 console.log(JSON.stringify({schema_version:'alpha-market-freeze/1.0',...result,accepted_for_evaluation:'requires_prepare_and_commit'}));
}
main().catch(e=>printMarketError(revocationHttpError(e)??e,'alpha-market-freeze/1.0')).finally(()=>closeS4Pool());
