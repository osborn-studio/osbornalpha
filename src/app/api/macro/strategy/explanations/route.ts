// src/app/api/macro/strategy/explanations/route.ts
// POST /api/macro/strategy/explanations {request_id, subject:{kind, id}, locale} (spec §6.3, §8): session → flag →
// handleExplainRequest (Task 11), which validates the body, replays an existing (user, request_id) run before the code
// version, foundation and subject checks (a replay needs no code version), and runs the metered call through
// productionLlmDeps. Responses are projections (or {error, explanation?}), private, no-store. Review subjects are
// immutable review result ids, canonicalized to lowercase before the handler (hash, storage) exactly as GET's uuidOf does. GET ?subject_kind=snapshot|review&subject_id= → first recoverUserExplanations (at most
// three of the caller's running rows whose provider output is recorded are finished from that output and settled — the
// provider is never called again; plan audit R2-1), then macro_expire_explanations(user) (admin; a run left running for
// more than five minutes without a recorded completion becomes abandoned → failed, so a reload never shows a dead run as
// running), then the caller's own projections (RLS), newest 20.
import {NextResponse} from 'next/server';
import {handleExplainRequest,recoverUserExplanations} from '@/lib/macro/strategy/explain-request';
import {productionLlmDeps} from '@/lib/macro/strategy/llm-deps';
import {strategyPort} from '@/lib/macro/strategy/port';
import {NO_STORE,canonicalExplainBody,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,sessionGate,strategyDb,subjectIdOf,subjectKindOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
export const maxDuration=60;
const LIST_LIMIT=20;

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const p=readParams(new URL(req.url),['subject_kind','subject_id']);
  const kind=subjectKindOf(p.get('subject_kind'));
  const id=subjectIdOf(kind,p.get('subject_id'));
  const db=strategyDb(g.session);
  await recoverUserExplanations({db,llm:productionLlmDeps(g.userId)},g.userId);
  await db.expireExplanations(g.userId);
  const items=await db.explanationsOf('session',kind,id,LIST_LIMIT);
  return NextResponse.json({items},{headers:NO_STORE});
 }catch(e){return failureResponse(e);}
}

export async function POST(req:Request){
 const g=await sessionGate();if(!g.ok)return g.res;
 let body:unknown;
 try{body=await req.json();}catch{return errorResponse('invalid_body','body must be JSON',400);}
 try{
  const r=await handleExplainRequest({db:strategyDb(g.session),port:strategyPort(),llm:productionLlmDeps(g.userId),now:()=>new Date(),codeVersion:codeVersionOrNull()},g.userId,canonicalExplainBody(body));
  return NextResponse.json(r.body,{status:r.status,headers:NO_STORE});
 }catch(e){
  if(e instanceof Error&&e.message==='not authenticated')return errorResponse('unauthorized','sign in required',401);
  return failureResponse(e);
 }
}
