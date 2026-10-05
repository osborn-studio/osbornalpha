import {createHmac} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {requireS4Actor,localSessionToken} from './auth';
import {s4Http} from './http';
// Isolate parsing: production's no-connection gate is separately covered by
// runtime/item-routes.test.ts; these tests cannot connect to any database.
vi.mock('./db',()=>({s4Pool:vi.fn()}));
const owner='10000000-0000-4000-8000-000000000001',secret='synthetic-local-session-secret-only';
const now=1800000000000;
const claims={userId:owner,kind:'agent',purpose:'alpha_s4_acceptance',issuedAt:now-1,expiresAt:now+60000};
const sign=(text:string)=>{const payload=Buffer.from(text).toString('base64url');return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');};
const request=(token:string)=>new Request('http://127.0.0.1:3199/api/research/s4/candidates',{headers:{host:'127.0.0.1:3199',cookie:'alpha_s4_local_session='+token}});
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(now);vi.stubEnv('ALPHA_RESEARCH_RUNTIME_MODE','local');vi.stubEnv('ALPHA_S4_LOCAL_AUTH','1');vi.stubEnv('ALPHA_S4_ORIGIN','http://127.0.0.1:3199');vi.stubEnv('ALPHA_S4_LOCAL_SESSION_SECRET',secret);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('accepts the existing issuer and exact maximum lifetime',async()=>{
 expect(await requireS4Actor(request(localSessionToken(owner,secret,now+3600000)))).toEqual({userId:owner,kind:'agent'});
});
it.each(['null','[]','42','"text"','{','{"userId":"x","userId":"y"}',...[
 {...claims,userId:null},{...claims,userId:'not-a-uuid'},{...claims,userId:owner.toUpperCase().replace('1000','ABCD')},
 {...claims,issuedAt:now+1},{...claims,issuedAt:now-.5},{...claims,expiresAt:now},{...claims,expiresAt:now+.5},
 {...claims,expiresAt:now+3600001},{...claims,kind:'human'},{...claims,purpose:'other'},
].map(value=>JSON.stringify(value))])('maps signed invalid payload to401: %s',async payload=>{
 const response=await s4Http(()=>requireS4Actor(request(sign(payload))));expect(response.status).toBe(401);expect(await response.json()).toEqual({error:{code:'not_authenticated'}});
});
it('rejects noncanonical encodings, bad signatures and oversized credentials',async()=>{
 const valid=sign(JSON.stringify(claims));
 for(const token of [valid+'=',valid.replace('.', '=.'),'x.x','a'.repeat(4097)]){
  const response=await s4Http(()=>requireS4Actor(request(token)));expect(response.status).toBe(401);expect(await response.json()).toEqual({error:{code:'not_authenticated'}});
 }
});

it('rejects otherwise-valid duplicate claims and invalid UTF-8',async()=>{
 const plain=JSON.stringify(claims);
 expect(await requireS4Actor(request(sign(plain)))).toEqual({userId:owner,kind:'agent'});
 const duplicate=plain.slice(0,-1)+',"userId":"20000000-0000-4000-8000-000000000002"}';
 const bytes=Buffer.concat([Buffer.from(plain.slice(0,-1)+',"unused":"'),Buffer.from([0xff]),Buffer.from('"}')]);
 const payload=bytes.toString('base64url');
 for(const token of [sign(duplicate),payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')]){
  const response=await s4Http(()=>requireS4Actor(request(token)));expect(response.status).toBe(401);
 }
});
it('rejects unused trailing bits even with matching decoded signature or valid HMAC',async()=>{
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 const mutate=(encoded:string)=>encoded.slice(0,-1)+alphabet[alphabet.indexOf(encoded.at(-1)!)+1];
 let plain=JSON.stringify(claims);while(Buffer.byteLength(plain)%3===0)plain+=' ';
 const valid=sign(plain),[payload,signature]=valid.split('.');
 const otherPayload=mutate(payload),otherSignature=mutate(signature);
 expect(Buffer.from(otherPayload,'base64url')).toEqual(Buffer.from(payload,'base64url'));
 expect(Buffer.from(otherSignature,'base64url')).toEqual(Buffer.from(signature,'base64url'));
 const resigned=otherPayload+'.'+createHmac('sha256',secret).update(otherPayload).digest('base64url');
 for(const token of [payload+'.'+otherSignature,resigned]){
  const response=await s4Http(()=>requireS4Actor(request(token)));expect(response.status).toBe(401);
 }
});
it('accepts exactly4096 characters and rejects a larger otherwise-valid signed token',async()=>{
 const base=JSON.stringify({...claims,pad:''});
 const boundary=sign(JSON.stringify({...claims,pad:'a'.repeat(3039-Buffer.byteLength(base))}));
 expect(boundary.length).toBe(4096);
 expect(await requireS4Actor(request(boundary))).toEqual({userId:owner,kind:'agent'});
 const oversized=sign(JSON.stringify({...claims,pad:'a'.repeat(3040-Buffer.byteLength(base))}));
 expect(oversized.length).toBeGreaterThan(4096);
 const response=await s4Http(()=>requireS4Actor(request(oversized)));expect(response.status).toBe(401);
});
