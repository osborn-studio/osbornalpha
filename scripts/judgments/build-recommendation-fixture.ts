// Reproduce the private recommendation replay fixture (spec §14.4), independently of the macro builder.
// node --import tsx scripts/judgments/build-recommendation-fixture.ts [--check]
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {buildRecommendationReplayFixture} from '../../src/lib/judgments/testing/recommendation-fixture';

const args=process.argv.slice(2);
if(args.length>1||args.some(a=>a!=='--check')){
 console.error('usage: build-recommendation-fixture.ts [--check]');process.exitCode=2;
}else{
 const path='fixtures/judgments/replay/recommendation-call.json';
 const text=JSON.stringify(buildRecommendationReplayFixture(),null,1)+'\n';
 if(args.includes('--check')){
  const same=existsSync(path)&&readFileSync(path,'utf8')===text;
  console.log(`${path}: ${same?'up to date':'differs from builder'}`);process.exitCode=same?0:1;
 }else{writeFileSync(path,text);console.log(`wrote ${path}`);}
}
