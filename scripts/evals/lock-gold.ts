/** Explicit operator action after human review; updates integrity metadata, never gold values. */
import {updateGoldLock} from '../../src/lib/evals/gold/update-lock';
const args=process.argv.slice(2);
if(args.length!==1||args[0].startsWith('-')){
 process.stderr.write('usage: lock-gold.ts <repo-relative-gold-file>\n');process.exitCode=2;
}else{
 try{process.stdout.write(`${JSON.stringify(updateGoldLock(args[0]))}\n`);}
 catch{process.stderr.write('gold lock update refused; check candidate admission, versions, paths and lock.json.pending ownership.\n');process.exitCode=1;}
}
