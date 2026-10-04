import {researchConfig} from './config';
import {assertResearchRequest} from './request';
import {requireResearchUser,ResearchForbidden} from '../store';
import {fail} from '../ingest/pa-v1/json.js';
import type {S4Actor} from '../s4/db';
/** Candidate only: the caller's s4Pool gate still prevents production execution. */
export async function requireProductionResearchActor(req:Request):Promise<S4Actor> {
  let config;
  try {config=researchConfig();} catch {fail('not_configured');}
  if(!config||config.mode!=='production')fail('not_configured');
  assertResearchRequest(req,config!.origin);
  // Never accept a local acceptance cookie in a production request, even alongside a real session.
  if(req.headers.get('cookie')?.split(';').some(part=>part.trim().split('=')[0].trim()==='alpha_s4_local_session'))fail('scope_denied');
  let userId:string;
  try {userId=(await requireResearchUser()).userId;}
  catch(error){if(error instanceof ResearchForbidden)fail('scope_denied');throw fail('not_authenticated');}
  if(!config!.owners.includes(userId!))fail('scope_denied');
  // Neither body nor caller headers can choose actor identity or upgrade an agent to human.
  return {userId:userId!,kind:'human'};
}
