// scripts/evals/codex-audit.ts
// Runs one Codex audit round on a committed target and appends it to the audit directory's index.json (spec §9).
//   npx tsx scripts/evals/codex-audit.ts --dir docs/audits/<date>-<topic> --prompt 00-prompt-round<N>.md --out <NN>-codex-round<N>.md [--target <path>]
// Codex: gpt-6-astra, reasoning effort medium, read-only sandbox, prompt on stdin. Exit 0 = round appended; 1 = refused/failed.
import {execFileSync,spawnSync} from 'node:child_process';
import {closeSync,openSync} from 'node:fs';
import {EvalError} from '../../src/lib/evals/errors';
import {codexArgs,runCodexAudit} from '../../src/lib/evals/validate/codex-audit';

function arg(argv:string[],name:string):string|undefined{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;}
function main(){
 const argv=process.argv.slice(2);
 const dir=arg(argv,'--dir'),prompt=arg(argv,'--prompt'),out=arg(argv,'--out'),target=arg(argv,'--target');
 if(!dir||!prompt||!out){console.error('usage: codex-audit.ts --dir <audit dir> --prompt <file in dir> --out <report file in dir> [--target <path>]');process.exitCode=1;return;}
 const root=process.cwd();
 try{
  const round=runCodexAudit({root,dir,prompt,out,target},{
   git:args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}),
   gitBytes:args=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024}),
   runCodex:(promptPath,outPath)=>{
    const fd=openSync(promptPath,'r');
    try{return spawnSync('codex',codexArgs(outPath),{cwd:root,stdio:[fd,'inherit','inherit']}).status??1;}finally{closeSync(fd);}
   },
  });
  console.log(JSON.stringify(round));
 }catch(e){
  console.error(e instanceof EvalError?`${e.code}: ${e.message}`:(e as Error).message);
  process.exitCode=1;
 }
}
main();
