/**
 * Hash a primary document for a gold case's source.sha256 (spec §4.6). Nothing is stored.
 *
 *   npx tsx scripts/evals/hash-source.ts <https-url>
 *
 * Prints {"url","sha256","bytes","status"} on stdout. Exit 1 on a fetch failure, 2 on bad arguments.
 */
import {hashSource} from '../../src/lib/evals/hash-source';

async function main(){
 const argv=process.argv.slice(2);
 if(argv.length!==1||!argv[0].startsWith('https://')){process.stderr.write('usage: hash-source.ts <https-url>\n');process.exitCode=2;return;}
 try{process.stdout.write(`${JSON.stringify(await hashSource(argv[0]))}\n`);}
 catch(e){process.stderr.write(`hash-source failed: ${e instanceof Error?e.message:String(e)}\n`);process.exitCode=1;}
}
void main();
