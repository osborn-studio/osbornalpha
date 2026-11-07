// scripts/macro/resolve-quarantine.ts
// Macro quarantine CLI (spec §4.3, §0.2 M10; runbook docs/runbooks/macro-sync.md §7).
//   node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts [--json]
//   node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts --accept <quarantine id> --observation <member id> --by <admin user uuid>
//   node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts --reject <quarantine id> --by <admin user uuid>
// Service-role client: run only on the owner's machine with SUPABASE_SERVICE_ROLE_KEY set.
import {supabaseMacroDb} from '../../src/lib/macro/db';
import {parseQuarantineArgs,runQuarantineCommand,type OpenItem} from '../../src/lib/macro/quarantine-cli';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {getAnonSupabase} from '../../src/lib/supabase/anon';
async function main(){
 const cmd=parseQuarantineArgs(process.argv.slice(2));
 const admin=getAdminSupabase();
 const db=supabaseMacroDb({admin,anon:getAnonSupabase()});
 const code=await runQuarantineCommand(cmd,{
  listOpen:async()=>{
   const out:OpenItem[]=[];
   for(let from=0;;from+=1000){
    const {data,error}=await admin.from('dq_quarantine').select('id,dataset,natural_key,reason_code,detail,payload,batch_id,created_at')
     .like('dataset','macro.%').eq('status','open').order('created_at').range(from,from+999);
    if(error)throw new Error(error.message);
    for(const row of (data??[]) as unknown as Omit<OpenItem,'members'>[])out.push({...row,members:await db.quarantineMembers(row.id)});
    if(!data||data.length<1000)break;
   }
   return out;
  },
  isAdmin:async id=>{
   const {data,error}=await admin.from('profiles').select('role').eq('id',id).maybeSingle<{role:string|null}>();
   if(error)throw new Error(error.message);
   return data?.role==='admin';
  },
  resolve:(id,decision,by,observationId)=>db.resolveConflict(id,decision,by,observationId),
  log:line=>console.log(line),
 });
 process.exit(code);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
