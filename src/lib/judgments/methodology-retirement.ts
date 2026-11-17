// Script-only argument parsing and retirement preflight; no writes until every key passes.
import {JudgmentError} from './errors';
import type {JudgmentsDb,Methodology} from './types';
const KEY=/^[a-z][a-z0-9_]{1,63}@v[1-9][0-9]{0,3}$/;
const invalid=(why:string):never=>{throw new JudgmentError('invalid_parameter',why);};
export function parseSyncArgs(argv:readonly string[]){
 const o={dryRun:false,only:new Set<string>(),publish:new Set<string>(),unpublish:new Set<string>(),retire:new Set<string>(),confirmation:undefined as string|undefined,reason:undefined as string|undefined};
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--dry-run')o.dryRun=true;
  else if(['--only','--publishable','--unpublish','--retire'].includes(x)&&v&&KEY.test(v)){
   (x==='--only'?o.only:x==='--publishable'?o.publish:x==='--unpublish'?o.unpublish:o.retire).add(v);i++;
  }else if((x==='--owner-confirmation'||x==='--reason')&&v&&!v.startsWith('--')){if(x==='--reason')o.reason=v;else o.confirmation=v;i++;}
  else invalid(`bad_argument:${x}`);
 }
 if(o.retire.size&&(!o.reason||o.reason.trim().length<10))invalid('retirement_reason_required: at least 10 characters');
 if(o.reason&&!o.retire.size)invalid('reason_without_retirement');
 for(const key of o.retire)if(o.publish.has(key)||o.unpublish.has(key)||o.only.has(key))invalid(`conflicting_retirement:${key}`);
 return o;
}
export interface Retirement{key:string;id:string;version:string;reason:string}
export async function planRetirements(keys:ReadonlySet<string>,reason:string|undefined,registry:readonly Methodology[],db:JudgmentsDb):Promise<Retirement[]>{
 if(keys.size&&(!reason||reason.trim().length<10))invalid('retirement_reason_required');
 const plan:Retirement[]=[];
 for(const key of keys){
  if(!KEY.test(key))invalid(`retirement_key:${key}`);
  const [id,version]=key.split('@');
  if(registry.some(m=>m.id===id&&m.version===version))invalid(`retirement_in_registry:${key}`);
  if(!await db.methodology(id,version))invalid(`retirement_missing:${key}`);
  // Read persisted state, including successors absent from this checkout's registry.
  const active=await db.listMethodologies('active');
  if(!active.some(m=>m.methodology_id===id&&Number(m.version.slice(1))>Number(version.slice(1))))invalid(`retirement_newer_active_required:${key}`);
  plan.push({key,id,version,reason:reason!});
 }
 return plan;
}
export async function applyRetirements(plan:readonly Retirement[],db:JudgmentsDb,dryRun:boolean){
 if(dryRun)return [];
 const done=[];
 for(const p of plan)done.push(await db.retireMethodology(p.id,p.version,'script',p.reason));
 return done;
}
