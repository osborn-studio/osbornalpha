// scripts/broker-research/replay.ts
// Usage: npx tsx scripts/broker-research/replay.ts --publication <uuid>   (read-only; exit 1 on any mismatch)
import {coreDeps} from '../../src/lib/broker-research/deps';
import {replayPublication} from '../../src/lib/broker-research/replay';

const i=process.argv.indexOf('--publication');const id=i>0?process.argv[i+1]:undefined;
if(!id){console.error('usage: --publication <uuid>');process.exit(2);}
replayPublication(coreDeps(),id!).then(r=>{console.log(JSON.stringify(r,null,1));process.exit(r.ok?0:1);},e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
