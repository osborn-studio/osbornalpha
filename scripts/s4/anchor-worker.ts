/** Run as a restricted local worker. --watch drains daily; --once is replay-safe. */
import {drainOutbox} from '../../src/lib/research/s4/anchor';
import {closeS4Pool} from '../../src/lib/research/s4/db';
async function main(){
  const userId=process.env.ALPHA_S4_ACTOR_ID,root=process.env.ALPHA_S4_RECEIPT_DIR;
  if(!userId||!root)throw new Error('worker_not_configured');
  do {
    let remaining:number,passes=0;
    do{const result=await drainOutbox({userId,kind:'agent'},root);console.log(JSON.stringify(result));remaining=result.remaining;passes++;}while(remaining>0&&passes<20);
    if(remaining>0)console.error('anchor_backlog_remaining: run again; bounded pass limit reached');
    if(!process.argv.includes('--watch'))break;
    await new Promise(resolve=>setTimeout(resolve,24*60*60*1000));
  } while(true);
}
main().catch(e=>{console.error((e as Error).message);process.exitCode=1;}).finally(closeS4Pool);
