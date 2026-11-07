// POST /api/macro/analyses: session, validation, truncation, quota, frozen inputs, failed runs (spec §7, §8, N1).
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),history:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:m.codeVersion}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn(async()=>({auth:{getUser:m.auth}}))}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:vi.fn(()=>({rpc:m.rpc}))}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:vi.fn(()=>({}))}));
vi.mock('@/lib/macro/db',async orig=>({...(await orig<typeof import('@/lib/macro/db')>()),supabaseMacroDb:vi.fn(()=>({seriesHistory:m.history}))}));
import {MacroDbError} from '@/lib/macro/db';
import {inputsHash} from '@/lib/macro/analysis-spec';
import {POST} from './route';
const me=(i:number)=>new Date(Date.UTC(2021,i+1,0)).toISOString().slice(0,10);
const hund=(n:number)=>{const s=String(n).padStart(3,'0');return `${s.slice(0,-2)}.${s.slice(-2)}`;};
const rows=(vals:number[],offset=0)=>vals.map((v,i)=>({observation_id:`o${i+offset}`,series_id:'X',period_end:me(i+offset),value_text:hund(v),version:1,available_at:'2026-01-01T00:00:00Z',status:'ok'}));
const xh=Array.from({length:48},(_,t)=>100+25*(t%3)+t);
const body={request_id:'0b8f8d3e-4a7c-4b7e-9e55-0f6f1f2a3b4c',kind:'change',indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:1,window:'all'};
const post=(b:unknown)=>POST(new Request('https://x/api/macro/analyses',{method:'POST',body:JSON.stringify(b)}));
describe('POST /api/macro/analyses',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.auth.mockResolvedValue({data:{user:{id:'user-1'}}});
  m.history.mockImplementation(async(id:string)=>id==='US_DFF'?rows(xh):id==='US_DGS10'?rows(xh.map(v=>2*v),1):[]);
  m.rpc.mockResolvedValue({data:'9d0c1a8e-1f2b-4c3d-8e4f-5a6b7c8d9e0f',error:null});
  m.codeVersion.mockReturnValue('c'.repeat(40));
 });
 it('503 code_version_unavailable when no verifiable code version exists: nothing read, computed or stored (第 4 稿 P1-10)',async()=>{
  for(const impl of [()=>null,()=>{throw new Error('git_not_allowed');}]){
   m.codeVersion.mockImplementation(impl);
   const r=await post(body);
   expect(r.status).toBe(503);expect((await r.json()).error.code).toBe('code_version_unavailable');
  }
  expect(m.history).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('401 without a session, nothing read or written',async()=>{
  m.auth.mockResolvedValue({data:{user:null}});
  expect((await post(body)).status).toBe(401);expect(m.history).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('400 with field errors for an invalid spec',async()=>{
  const r=await post({...body,lag:40});
  expect(r.status).toBe(400);expect((await r.json()).error.fields).toContainEqual({field:'lag',code:'maximum'});
 });
 it('reads histories at the cutoff, freezes inputs and writes with the session user id',async()=>{
  const r=await post(body);
  expect(r.status).toBe(201);expect(await r.json()).toEqual({runId:'9d0c1a8e-1f2b-4c3d-8e4f-5a6b7c8d9e0f'});
  expect(m.history).toHaveBeenCalledWith('US_DFF',expect.objectContaining({maxRows:5000,asOf:expect.any(String)}));
  expect(m.history).toHaveBeenCalledWith('US_DGS10',expect.objectContaining({maxRows:5000}));
  const [fn,args]=m.rpc.mock.calls[0];
  expect(fn).toBe('create_macro_analysis_run');
  expect(args).toMatchObject({p_user_id:'user-1',p_request_id:body.request_id,p_kind:'change',p_status:'ok',p_error:null,p_method_version:'macro-correlation/1',p_code_version:'c'.repeat(40)});
  expect(args.p_inputs_hash).toBe(inputsHash(args.p_inputs));
  expect(args.p_inputs.asset).toMatchObject({series_id:'US_UST10Y',source_series_id:'US_DGS10',change_kind:'bp'});
  expect(args.p_results.r).toBeCloseTo(1,12);expect(args.p_results.explanation.zh).toContain('强正相关');
 });
 it('truncated history → 422 and nothing computed or written',async()=>{
  m.history.mockRejectedValue(new MacroDbError('truncated'));
  const r=await post(body);
  expect(r.status).toBe(422);expect((await r.json()).error.code).toBe('input_truncated');expect(m.rpc).not.toHaveBeenCalled();
 });
 it('quota_exceeded from the RPC → 429',async()=>{
  m.rpc.mockResolvedValue({data:null,error:{message:'quota_exceeded'}});
  const r=await post(body);
  expect(r.status).toBe(429);expect((await r.json()).error.code).toBe('quota_exceeded');
 });
 it('an analysis error is stored as a failed run (not counted) and returned as 400 with its code',async()=>{
  m.history.mockImplementation(async(id:string)=>id==='US_DFF'?rows(xh.slice(0,20)):rows(xh.slice(0,20).map(v=>2*v),1));
  const r=await post(body);
  expect(r.status).toBe(400);
  const j=await r.json();expect(j.error.code).toBe('insufficient_sample');expect(j.runId).toBe('9d0c1a8e-1f2b-4c3d-8e4f-5a6b7c8d9e0f');
  expect(m.rpc.mock.calls[0][1]).toMatchObject({p_status:'failed',p_results:null});
 });
});
