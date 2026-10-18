/** Anchor runner process (ADR 2026-10-18 §4). Runs as the dedicated OS user on the approved
 * runner host with the runner database login and the registry client login. `--once` runs one
 * cycle; `--watch` repeats every ALPHA_ANCHOR_INTERVAL_SECONDS until SIGTERM/SIGINT. Output is
 * one JSON line per owner per cycle: sequences, hashes, counts and codes only. Exit codes:
 * 0 every owner drained; 2 an owner paused, failed integrity or errored; 1 configuration error. */
import {Pool} from 'pg';
import {anchorRunnerConfig} from '../../src/lib/research/s4/anchor-runner-config';
import {readRunnerManifest} from '../../src/lib/research/s4/anchor-manifest';
import {createCheckpointRegistry} from '../../src/lib/research/s4/checkpoint-registry';
import {runAnchorCycle} from '../../src/lib/research/s4/anchor-runner-program';

async function main(){
  const watch=process.argv.includes('--watch');
  if(!watch&&!process.argv.includes('--once')){console.error('usage: runner.ts --once | --watch');process.exitCode=1;return;}
  let config;
  try{config=anchorRunnerConfig();}catch{console.error('runner_configuration_invalid');process.exitCode=1;return;}
  const manifest=await readRunnerManifest(config.manifestPath);
  const pool=new Pool(config.db);
  pool.on('error',error=>{console.error('runner idle client error',{code:(error as {code?:string}).code??'unknown'});});
  const registry=createCheckpointRegistry(config.registry);
  let stopping=false;const stop=()=>{stopping=true;};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{
    do{
      const results=await runAnchorCycle({manifest,root:config.receiptRoot,principalId:config.principalId,owners:config.owners,db:pool,registry,watchdogMs:config.watchdogMs});
      for(const r of results)console.log(JSON.stringify({cycle_at:new Date().toISOString(),...r}));
      if(results.some(r=>r.status!=='drained'))process.exitCode=2;
      if(!watch||stopping)break;
      for(let waited=0;waited<config.intervalSeconds&&!stopping;waited++)await new Promise(resolve=>setTimeout(resolve,1000));
    }while(!stopping);
  }finally{
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    await registry.close();await pool.end();
  }
}
main().catch(error=>{console.error((error as {code?:string}).code??'runner_failed');process.exitCode=process.exitCode||1;});
