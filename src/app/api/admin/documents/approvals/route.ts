// src/app/api/admin/documents/approvals/route.ts
// POST an extraction approval (spec §4.7, §9, owner decision C): the record that authorises
// auto-decisions for one extractor_ref at exactly these extractor/table/code versions and concepts.
// precision and recall are decimal strings in [0,1] compared exactly (scaled BigInt): either below
// 0.95 → 422 threshold before the database; the table's ea_threshold check is the final authority
// (its violation also answers 422). approved_by is the signed-in admin. Audited.
import {requireAdminUser} from '@/lib/admin/auth';
import {adminFailure,auditBestEffort,json,jsonError,writeGuard} from '@/lib/documents/candidates/admin-http';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import {HK_CONCEPT_IDS} from '@/lib/documents/hk-facts/checks';
import {toScaled} from '@/lib/documents/hk-facts/exact';
import {DocumentsDbError} from '@/lib/documents/types';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const RATIO=/^(0(\.\d{1,12})?|1(\.0{1,12})?)$/;
const text=(v:unknown,max=128)=>typeof v==='string'&&v.length>=1&&v.length<=max;
const atLeast=(v:string,min:string)=>{const {a,b}=toScaled(v,min);return a>=b;};

export async function POST(request:Request){
 try{
  const user=await requireAdminUser();
  const guard=writeGuard(request);if(guard)return guard;
  const b=(await request.json().catch(()=>null)) as Record<string,unknown>|null;
  if(b===null||typeof b!=='object')return jsonError('invalid_body',400);
  const {extractorRef,extractorVersion,tableAlgoVersion,codeVersion,concepts,goldSha256,precision,recall,reportPath}=b;
  if(!text(extractorRef)||!text(extractorVersion)||!text(tableAlgoVersion)||!text(codeVersion))return jsonError('invalid_versions',400);
  if(!Array.isArray(concepts)||concepts.length===0||concepts.some(c=>typeof c!=='string'||!HK_CONCEPT_IDS.includes(c))||new Set(concepts).size!==concepts.length)return jsonError('invalid_concepts',400);
  if(typeof goldSha256!=='string'||!/^[0-9a-f]{64}$/.test(goldSha256))return jsonError('invalid_gold_sha256',400);
  if(typeof precision!=='string'||!RATIO.test(precision)||typeof recall!=='string'||!RATIO.test(recall))return jsonError('invalid_ratio',400);
  if(!text(reportPath,512)||!(reportPath as string).startsWith('docs/audits/')||(reportPath as string).split(/[\\/]/).includes('..'))return jsonError('invalid_report_path',400);
  if(!atLeast(precision,'0.95')||!atLeast(recall,'0.95'))return jsonError('threshold',422);
  const admin=getAdminSupabase();
  let approvalId:string;
  try{
   approvalId=await supabaseDocumentsDb(admin).insertApproval({extractor_ref:extractorRef as string,extractor_version:extractorVersion as string,table_algo_version:tableAlgoVersion as string,code_version:codeVersion as string,
    concepts:concepts as string[],gold_sha256:goldSha256,precision,recall,report_path:reportPath as string,approved_by:user.id});
  }catch(e){if(e instanceof DocumentsDbError&&/ea_threshold/.test(e.message))return jsonError('threshold',422);throw e;}
  await auditBestEffort(admin,user.id,'document.approval_insert',approvalId,{extractor_ref:extractorRef,extractor_version:extractorVersion,table_algo_version:tableAlgoVersion,code_version:codeVersion,concepts,gold_sha256:goldSha256,precision,recall,report_path:reportPath});
  return json({approvalId},201);
 }catch(e){return adminFailure(e,'admin/documents/approvals');}
}
