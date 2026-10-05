import {requireProductionResearchActor} from '../runtime/session';
import {assertResearchRequest} from '../runtime/request';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {parseStrict,fail} from '../ingest/pa-v1/json.js';
import {requireResearchUser} from '../store';
import {s4Pool,type S4Actor} from './db';
const COOKIE='alpha_s4_local_session';
export function localSessionToken(userId:string,secret:string,expiresAt:number) {
  const issuedAt=Date.now();if(expiresAt<=issuedAt||expiresAt-issuedAt>3600000)throw new Error('invalid_session_lifetime');
  const payload=Buffer.from(JSON.stringify({userId,kind:'agent',purpose:'alpha_s4_acceptance',issuedAt,expiresAt})).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
}
export async function requireS4Actor(req:Request):Promise<S4Actor> {
  s4Pool();
  if(process.env.ALPHA_RESEARCH_RUNTIME_MODE==='production')return requireProductionResearchActor(req);
  const origin=process.env.ALPHA_S4_ORIGIN;
  assertResearchRequest(req,origin);
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin!).hostname))fail('scope_denied');
  if(process.env.ALPHA_S4_LOCAL_AUTH==='1') {
    const secret=process.env.ALPHA_S4_LOCAL_SESSION_SECRET;
    if(!secret||secret.length<32)fail('not_configured');
    const token=req.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    // Local acceptance credentials are bounded, canonical, and always rejected
    // as authentication failures before a malformed claim reaches a DB query.
    try {
      if(!token||token.length>4096)throw new Error();
      const parts=token.split('.');
      if(parts.length!==2||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw new Error();
      const payload=Buffer.from(parts[0],'base64url'),signature=Buffer.from(parts[1],'base64url');
      if(payload.toString('base64url')!==parts[0]||signature.toString('base64url')!==parts[1])throw new Error();
      const expected=createHmac('sha256',secret!).update(parts[0]).digest();
      if(signature.length!==expected.length||!timingSafeEqual(signature,expected))throw new Error();
      const value=parseStrict(payload),now=Date.now();
      if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.userId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.userId)
        ||value.purpose!=='alpha_s4_acceptance'||value.kind!=='agent'||!Number.isSafeInteger(value.expiresAt)||!Number.isSafeInteger(value.issuedAt)
        ||value.issuedAt<0||value.issuedAt>now||value.expiresAt<=value.issuedAt||value.expiresAt-value.issuedAt>3600000||value.expiresAt<=now)throw new Error();
      return {userId:value.userId,kind:'agent'};
    }catch{throw fail('not_authenticated');}
  }
  const ctx=await requireResearchUser();return {userId:ctx.userId,kind:'human'};
}
