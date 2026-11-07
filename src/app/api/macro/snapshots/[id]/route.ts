// src/app/api/macro/snapshots/[id]/route.ts
// GET /api/macro/snapshots/[id] (spec §8): full snapshot (manifest + catalog counts). Regime and
// contributions only when MACRO_JUDGMENTS_ENABLED === '1' (spec §3.2, plan cross-task convention); db.regimeOf reads the
// service-only macro_regime_results through the admin client, server-side only (第 6 稿 P1-2).
import {UUID_RE,errorResponse,failureResponse,macroRouteDeps,okJson,publicObservation,requireSessionUser} from '@/lib/macro/route-helpers';

export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid snapshot id',400);
 try{
  const {db}=macroRouteDeps();
  const snap=await db.snapshot(id);
  if(!snap)return errorResponse('not_found','snapshot not found',404);
  const observations=(await db.observationsByIds(snap.observation_ids)).map(r=>({...publicObservation(r),code_version:r.code_version}));
  const body:Record<string,unknown>={catalogVersion:snap.catalog_version,snapshot:snap,observations};
  if(process.env.MACRO_JUDGMENTS_ENABLED==='1'){
   const r=await db.regimeOf(id);
   body.regime=r?.regime??null;body.contributions=r?.contributions??[];body.rulesVersion=r?.rules_version??null;body.uncoveredWeight=r?.uncovered_weight??null;
  }
  return okJson(body);
 }catch(e){return failureResponse(e,'macro-snapshot');}
}
