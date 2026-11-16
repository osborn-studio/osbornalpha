// Shared JSON and admin boundary regressions (spec §10; commander decision D2).
import {describe,expect,it,vi} from 'vitest';
vi.mock('./deps',()=>({resolveCodeVersion:()=>null}));
vi.mock('../admin/auth',()=>({requireAdminUser:async()=>({id:'admin'}),AdminForbidden:class extends Error{},AdminUnauthenticated:class extends Error{}}));
import {adminBody,adminGate,errorResponse,okResponse,privateResponse,serializeBody} from './route-utils';

describe('route response boundaries',()=>{
 it('removes only null display.percent recursively without mutating inputs',async()=>{
  const input={cards:[{display:{percent:null,value:3}},{display:{percent:0}}],percent:null};
  expect(serializeBody(input)).toEqual({cards:[{display:{value:3}},{display:{percent:0}}],percent:null});
  expect(input.cards[0].display).toHaveProperty('percent',null);
  for(const res of [okResponse(input,{empty:false}),privateResponse(input)]){
   const body=await res.json();expect(body.cards[0].display).not.toHaveProperty('percent');expect(body.codeVersion).toBeNull();
  }
  const error=errorResponse('internal','failed',500);
  expect(error.headers.get('cache-control')).toBe('no-store');
 });
 it('rejects a JSON array as an invalid body',async()=>{
  const result=await adminBody(new Request('https://alpha.example',{method:'POST',body:'[]'}),{reasonRequired:false});
  expect(result).toBeInstanceOf(Response);
  expect(await (result as Response).json()).toMatchObject({error:{code:'invalid_body'}});
 });
 it('requires the exact application/json media type, allowing charset parameters',async()=>{
  for(const type of ['application/jsonp','application/json-invalid']){
   const gate=await adminGate(new Request('https://alpha.example',{headers:{'content-type':type}}),{write:true});
   expect('response' in gate&&gate.response.status).toBe(415);
  }
  expect(await adminGate(new Request('https://alpha.example',{headers:{'content-type':'application/json; charset=utf-8'}}),{write:true})).toHaveProperty('user');
 });
});
