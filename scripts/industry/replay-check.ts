/**
 * Weekly replay sample (spec §1.1 success criteria, §15): pick `--sample` ok cells of a run
 * deterministically (sha256 of --seed + cell key), read each content-addressed manifest from the
 * private bucket and recompute the cell with replayFromManifest only; compare with the stored value.
 *
 *   node --env-file=.env.local --import tsx scripts/industry/replay-check.ts [--run <run_id>] [--sample 50] [--seed <text>]
 *
 * Without --run the active sw2021 L1 run is checked; the default seed is the ISO week (YYYY-Www) so
 * each week samples a different set. Read-only. Exit 0 when every sampled cell reproduced, 1 on any
 * mismatch or unreadable manifest, 2 on bad arguments or no run.
 */
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {supabaseIndustryDb} from '../../src/lib/industry/db';
import {replayCheck} from '../../src/lib/industry/jobs';
import {supabaseManifestStore} from '../../src/lib/industry/manifest';

const USAGE='usage: replay-check.ts [--run <run_id>] [--sample n (1..500, default 50)] [--seed <text>]';
function isoWeek(d:Date):string{
 const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
 const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
 const y=t.getUTCFullYear(),w=Math.ceil(((t.getTime()-Date.UTC(y,0,1))/86_400_000+1)/7);
 return `${y}-W${String(w).padStart(2,'0')}`;
}

async function main(){
 const argv=process.argv.slice(2);let runId:string|undefined,sample=50,seed=isoWeek(new Date());
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}
  if(x==='--run'){if(!/^[0-9a-f-]{36}$/i.test(v)){console.error('--run must be a uuid');process.exit(2);}runId=v;}
  else if(x==='--sample'){sample=Number(v);if(!Number.isInteger(sample)||sample<1||sample>500){console.error(USAGE);process.exit(2);}}
  else if(x==='--seed')seed=v;
  else{console.error(USAGE);process.exit(2);}
  i++;
 }
 const admin=getAdminSupabase();
 const db=supabaseIndustryDb(admin);
 const r=await replayCheck({db,manifests:supabaseManifestStore(admin,db)},{runId,sample,seed});
 console.log(JSON.stringify({seed,...r},null,1));
 if('error' in r)process.exit(2);
 process.exit(r.mismatches.length===0?0:1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
