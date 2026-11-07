// src/app/api/admin/documents/hk-quarantine/[id]/route.ts
// POST verdict on an HK fact quarantine item (spec §9, R5-12): {status:'resolved_accept'|
// 'resolved_reject', chosenFactIds?} (chosenFactIds only with accept, ≤ 100 uuids). Accept →
// resolve_hk_facts_quarantine through resolveHkFactsItem (promotion + done hook in one
// transaction); run_pending 409, invalid_choice 422, not_hk_item 404, already_resolved 409. Reject →
// the plan-1 flip. Accept facts.hk items here, not through the generic /api/admin/dq/quarantine/[id]
// (its hook records no_target after the promotion). Items that were accepted there anyway are
// repaired afterwards by finalizeHkHooks, which closes only the hook (HK has no metrics); that
// repair runs when the candidates job reaches its promote phase and is bounded per run.
import {requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {adminFailure,auditBestEffort,json,jsonError,UUID_RE,writeGuard} from '@/lib/documents/candidates/admin-http';
import {supabaseHkFactsPort} from '@/lib/documents/hk-facts/facts-port';
import {resolveHkFactsItem} from '@/lib/documents/hk-facts/resolve';
import type {HkResolveOutcome} from '@/lib/documents/hk-facts/resolve';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
const RESOLUTIONS=['resolved_accept','resolved_reject'] as const;
const MAX_CHOSEN=100;
const HTTP:Record<HkResolveOutcome,number>={resolved:200,not_found:404,already_resolved:409,not_hk_item:404,invalid_choice:422,run_pending:409};

export async function POST(request:Request,{params}:Ctx){
 try{
  const user=await requireAdminUser();
  const guard=writeGuard(request);if(guard)return guard;
  const {id}=await params;
  if(!UUID_RE.test(id))return jsonError('invalid_id',400);
  const body:unknown=await request.json().catch(()=>null);
  const status=(body as {status?:unknown}|null)?.status;
  if(typeof status!=='string'||!RESOLUTIONS.includes(status as typeof RESOLUTIONS[number]))return jsonError('invalid_status',400);
  const chosen=(body as {chosenFactIds?:unknown}|null)?.chosenFactIds;
  if(chosen!==undefined&&(!Array.isArray(chosen)||chosen.length>MAX_CHOSEN||chosen.some(v=>typeof v!=='string'||!UUID_RE.test(v))))return jsonError('invalid_chosen_fact_ids',400);
  if(chosen!==undefined&&status!=='resolved_accept')return jsonError('chosen_fact_ids_not_applicable',400);
  const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
  const [item]=await tables.select('dq_quarantine',{id},{limit:1});
  if(!item)return json({id,outcome:'not_found'},404);
  const r=await resolveHkFactsItem(supabaseHkFactsPort(admin),tables,item,{status:status as typeof RESOLUTIONS[number],...(chosen===undefined?{}:{chosenFactIds:chosen as string[]}),resolvedBy:user.id});
  if(r.outcome==='resolved')await auditBestEffort(admin,user.id,'dq.quarantine_resolve',id,{id,route:'hk-quarantine',status,outcome:r.outcome,promoted:r.promoted??null,skipped:r.skipped??null,chosen_fact_ids:r.chosenFactIds??null});
  return json({id,...r},HTTP[r.outcome]);
 }catch(e){return adminFailure(e,'admin/documents/hk-quarantine');}
}
