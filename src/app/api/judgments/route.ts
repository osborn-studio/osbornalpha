// src/app/api/judgments/route.ts
// GET /api/judgments (spec §10): one card per (judgment_type, methodology) for a public subject.
// latest_judgment_cards through anon (RLS = publication gate), view=latest | as_known&asOf=,
// abstained cards only with include_abstained=1, issuer subjects include judgments registered on
// issuers merged into it (spec §12.4; marked merged_from), methods with publishable=false never yield a card.
import {cardsOf,methodKey} from '@/lib/judgments/display';
import {publicReads} from '@/lib/judgments/public-reads';
import {JUDGMENT_TYPES,flagParam,internalErrorResponse,listParam,okResponse,paramErrorResponse,readParams,subjectParams,viewParams} from '@/lib/judgments/route-utils';

export const dynamic='force-dynamic';
const PARAMS=['subject_type','subject_key','types','asOf','view','include_abstained'] as const;

export async function GET(req:Request){
 const now=new Date();const today=now.toISOString().slice(0,10);
 let q;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  q={subject:subjectParams(p),types:listParam(p,'types',JUDGMENT_TYPES,JUDGMENT_TYPES.length),view:viewParams(p,today),includeAbstained:flagParam(p,'include_abstained')};
 }catch(e){return paramErrorResponse(e)??internalErrorResponse(e,'judgments');}
 try{
  const r=publicReads();
  const [envelopes,methods]=await Promise.all([r.db.latestCards(q.subject,{types:q.types,view:q.view.view,cutoff:q.view.cutoff}),r.db.listMethodologies()]);
  const cards=cardsOf(envelopes,new Map(methods.map(m=>[methodKey(m),m])),{includeAbstained:q.includeAbstained,requestedKey:q.subject.type==='issuer'?q.subject.key:undefined,now:q.view.cutoff??now.toISOString()});
  return okResponse({subject:q.subject,asOf:q.view.asOf,view:q.view.view,cards},{empty:cards.length===0});
 }catch(e){return internalErrorResponse(e,'judgments');}
}
