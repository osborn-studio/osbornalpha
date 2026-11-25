/**
 * node --env-file="$HOME/.config/osbornalpha/secrets.env" --import tsx scripts/industry/vendor-sync.ts --job gildata-industry-financials [--plan|--apply] [--l1 801080.SI]... [--from-year 2016] [--to-year 2026] [--fixtures <dir>]
 * Default dry-run calls the vendor and writes nothing.
 */
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {parseVendorSyncArgs,productionVendorDeps,runVendorJob,vendorJobGate} from '../../src/lib/industry/vendor/jobs';
import {failedReceipt} from '../../src/lib/industry/vendor/types';
import type {RunnerReceipt} from '../../src/lib/industry/jobs';

async function main(){
 let args:ReturnType<typeof parseVendorSyncArgs>|undefined,codeVersion:string|null=null,receipt:RunnerReceipt;
 try{
  args=parseVendorSyncArgs(process.argv.slice(2));
  const gate=vendorJobGate(args.job,process.env,args);
  if(gate){receipt=failedReceipt(gate.code);process.exitCode=2;}
  else{
   codeVersion=resolveCodeVersion({allowGit:args.mode==='apply'});
   if(!codeVersion&&args.mode==='apply')receipt=failedReceipt('code_version_unavailable');
   else{
    const deps=productionVendorDeps({...args,env:process.env,codeVersion});
    receipt=await runVendorJob(args.job,deps,{...args,triggeredBy:'script'});
   }
   process.exitCode=receipt.status==='failed'?1:0;
  }
 }catch{receipt=failedReceipt(args?'vendor_sync_failed':'invalid_arguments');process.exitCode=args?1:2;}
 console.log(JSON.stringify({mode:args?.mode??null,job:args?.job??null,codeVersion,calls:receipt.counts.calls??0,receipt}));
}
void main();
