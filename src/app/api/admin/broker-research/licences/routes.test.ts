// Admin licence and public switch route contracts (spec §8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ADMIN_ID,LICENCE_INPUT,memoryCoreDeps,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryCore} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',()=>({coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {GET as LIST,POST as CREATE} from './route';
import {GET as ONE,PATCH} from './[licenceId]/route';
import {POST as CONFIRM} from './[licenceId]/confirm/route';
import {POST as PUBLIC} from '../settings/public/route';

const BASE='/api/admin/broker-research/licences';
describe('licence routes',()=>{
 let d:MemoryCore;
 beforeEach(()=>{vi.clearAllMocks();d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 describe('POST licences',()=>{
  adminGuardCases({call:(r)=>CREATE(r,{}),request:()=>jsonReq(BASE,LICENCE_INPUT),requireAdmin:mocks.requireAdmin,post:true});
  it('201 creates; 400 on an invalid body',async()=>{
   const r=await CREATE(jsonReq(BASE,LICENCE_INPUT),{});expect(r.status).toBe(201);
   expect((await bodyOf<{licence:{version:number}}>(r)).licence.version).toBe(1);
   const invalid=await CREATE(jsonReq(BASE,{...LICENCE_INPUT,snippet_max_chars:900}),{});
   expect(invalid.status).toBe(400);expect(await errCode(invalid)).toBe('invalid_licence:snippet_max_chars');
  });
 });
 describe('GET licences',()=>{
  adminGuardCases({call:(r)=>LIST(r,{}),request:()=>getReq(BASE),requireAdmin:mocks.requireAdmin,post:false});
  it('lists licences with the settings row, no-store',async()=>{
   await seedLicence(d.db);const r=await LIST(getReq(BASE),{});
   expect(r.headers.get('cache-control')).toBe('no-store');
   const b=await bodyOf<{licences:unknown[];settings:{public_enabled:boolean}}>(r);
   expect(b.licences).toHaveLength(1);expect(b.settings.public_enabled).toBe(false);
  });
 });
 describe('GET/PATCH licences/[licenceId] and confirm',()=>{
  it('404 for an unknown id, 400 for a malformed id',async()=>{
   expect((await ONE(getReq(`${BASE}/x`),ctxOf({licenceId:'x'}))).status).toBe(400);
   expect((await ONE(getReq(`${BASE}/00000000-0000-4000-8000-0000000000ff`),ctxOf({licenceId:'00000000-0000-4000-8000-0000000000ff'}))).status).toBe(404);
  });
  it('PATCH reports material changes; confirm with a stale version is 409 version_mismatch',async()=>{
   const l=await seedLicence(d.db);const ctx=ctxOf({licenceId:l.licence_id});
   const p=await PATCH(jsonReq(`${BASE}/${l.licence_id}`,{allows_public_target_price:false},{method:'PATCH'}),ctx);
   expect(p.status).toBe(200);expect(await bodyOf(p)).toMatchObject({material:true,licence:{version:l.version+1,confirmed_at:null}});
   const stale=await CONFIRM(jsonReq(`${BASE}/${l.licence_id}/confirm`,{version:l.version}),ctx);
   expect(stale.status).toBe(409);expect(await errCode(stale)).toBe('version_mismatch');
   const ok=await CONFIRM(jsonReq(`${BASE}/${l.licence_id}/confirm`,{version:l.version+1}),ctx);
   expect(ok.status).toBe(200);
  });
  it('PATCH and confirm enforce 415 and origin',async()=>{
   const l=await seedLicence(d.db);const ctx=ctxOf({licenceId:l.licence_id});
   const t=await PATCH(new Request(`https://alpha.example${BASE}/${l.licence_id}`,{method:'PATCH',headers:{'content-type':'text/plain'},body:'{}'}),ctx);
   expect(t.status).toBe(415);
   const o=await CONFIRM(jsonReq(`${BASE}/${l.licence_id}/confirm`,{version:1},{headers:{origin:'https://evil.example'}}),ctx);
   expect(o.status).toBe(403);
  });
 });
 describe('POST settings/public',()=>{
  adminGuardCases({call:(r)=>PUBLIC(r,{}),request:()=>jsonReq('/api/admin/broker-research/settings/public',{enabled:true}),requireAdmin:mocks.requireAdmin,post:true});
  it('flips the switch; non-boolean is 400',async()=>{
   const r=await PUBLIC(jsonReq('/api/admin/broker-research/settings/public',{enabled:true}),{});
   expect(r.status).toBe(200);expect((await bodyOf<{settings:{public_enabled:boolean}}>(r)).settings.public_enabled).toBe(true);
   expect((await PUBLIC(jsonReq('/api/admin/broker-research/settings/public',{enabled:'yes'}),{})).status).toBe(400);
  });
 });
});
