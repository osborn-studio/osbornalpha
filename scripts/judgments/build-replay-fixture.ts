/**
 * Build the golden replay fixtures (spec §14.4) from code, so the committed JSON is reproducible byte for byte.
 *
 *   npx tsx scripts/judgments/build-replay-fixture.ts macro [--check]
 *
 * Writes fixtures/judgments/replay/<name>.json (JSON.stringify(…, null, 1) + newline). --check compares instead of writing:
 * exit 0 when identical, 1 when different or missing. Exit 2 on bad arguments.
 */
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {buildMacroReplayFixture} from '../../src/lib/judgments/testing/macro-fixture';

const BUILDERS:Record<string,{path:string;build:()=>Promise<unknown>}>={
 macro:{path:'fixtures/judgments/replay/macro-regime.json',build:buildMacroReplayFixture},
};

async function main(){
 const [which,...rest]=process.argv.slice(2);
 const b=which?BUILDERS[which]:undefined;
 if(!b||rest.some(a=>a!=='--check')){console.error(`usage: build-replay-fixture.ts ${Object.keys(BUILDERS).join('|')} [--check]`);process.exitCode=2;return;}
 const text=JSON.stringify(await b.build(),null,1)+'\n';
 if(rest.includes('--check')){
  const same=existsSync(b.path)&&readFileSync(b.path,'utf8')===text;
  console.log(same?`${b.path}: up to date`:`${b.path}: differs from the builder (run without --check to rewrite)`);
  process.exitCode=same?0:1;return;
 }
 mkdirSync(dirname(b.path),{recursive:true});
 writeFileSync(b.path,text);
 console.log(`wrote ${b.path} (${Buffer.byteLength(text)} bytes)`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
