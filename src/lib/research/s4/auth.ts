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
  const origin=process.env.ALPHA_S4_ORIGIN;
  if(!origin || req.headers.get('host')!==new URL(origin).host||new URL(req.url).protocol!==new URL(origin).protocol || !['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))fail('scope_denied');
  if(req.headers.get('sec-fetch-site')==='cross-site'||(req.method!=='GET'&&req.headers.get('origin')!==origin))fail('scope_denied');
  if(process.env.ALPHA_S4_LOCAL_AUTH==='1') {
    const secret=process.env.ALPHA_S4_LOCAL_SESSION_SECRET;
    if(!secret||secret.length<32)fail('not_configured');
    const token=req.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!token)fail('not_authenticated');
    const parts=token!.split('.');if(parts.length!==2)fail('not_authenticated');
    const expected=createHmac('sha256',secret!).update(parts[0]).digest();
    const signature=Buffer.from(parts[1],'base64url');
    if(signature.length!==expected.length||!timingSafeEqual(signature,expected))fail('not_authenticated');
    const value=parseStrict(Buffer.from(parts[0],'base64url'));
    if(value.purpose!=='alpha_s4_acceptance'||value.kind!=='agent'||!Number.isFinite(value.expiresAt)||!Number.isFinite(value.issuedAt)||value.issuedAt>Date.now()||value.expiresAt-value.issuedAt>3600000||value.expiresAt<=Date.now())fail('not_authenticated');
    return {userId:value.userId,kind:'agent'};
  }
  const ctx=await requireResearchUser();return {userId:ctx.userId,kind:'human'};
}
