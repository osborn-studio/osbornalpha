import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),deps:vi.fn(),cv:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:m.cv}));
vi.mock('@/lib/macro/route-helpers',async orig=>({...await orig<typeof import('@/lib/macro/route-helpers')>(),requireSessionUser:m.auth,macroRouteDeps:m.deps}));
import {GET} from './route';
import {prepareAnalysis} from '@/lib/macro/analysis-service';
import {PRESETS,PRESETS_VERSION} from '@/components/macro/correlation-presets';
import {presetRequestId} from '@/lib/macro/preset-request-id';
import {memoryMacroDb} from '@/lib/macro/memory-db';
import {AnalysisError} from '@/lib/macro/correlation';
import {MacroDbError} from '@/lib/macro/db';
import {NextResponse} from 'next/server';
const cutoff='2026-11-01T00:00:00.000Z';let serial=0;
const get=(query='region=US')=>GET(new Request(`https://x/api/macro/analyses/presets?${query}`));
let db:ReturnType<typeof memoryMacroDb>;
beforeEach(()=>{
 vi.clearAllMocks();db=memoryMacroDb();
 vi.spyOn(db,'activeSnapshot').mockResolvedValue({snapshot_id:`snapshot-${++serial}`,created_at:cutoff} as Awaited<ReturnType<typeof db.activeSnapshot>>);
 m.auth.mockResolvedValue({ok:true,user:{id:'me'}});m.cv.mockReturnValue('c'.repeat(40));m.deps.mockReturnValue({db,rpc:m.rpc});
});
describe('GET analysis presets',()=>{
 it('matches direct shared-service output, includes failures, never creates runs or calls a quota RPC',async()=>{
  const before=Object.keys(db); // memory db exposes no analysis persistence operations
  const r=await get();const body=await r.json();
  expect(r.status).toBe(200);expect(r.headers.get('X-Macro-Presets-Memo')).toBe('miss');expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(body.presets_version).toBe(PRESETS_VERSION);expect(body.cards).toHaveLength(6);
  for(const p of PRESETS.filter(p=>p.region==='US')){
   const spec={...p.form,request_id:presetRequestId(p.id)};
   const direct=await prepareAnalysis({db},spec,{cutoff,codeVersion:'c'.repeat(40),history:'eligible_as_of'});
   expect(body.cards.find((c:{preset_id:string})=>c.preset_id===p.id)).toMatchObject({preset_id:p.id,run_id:null,spec,inputs:direct.inputs,inputs_hash:direct.inputs_hash,data_hash:direct.data_hash,results:direct.results,status:'failed',error:expect.stringContaining(direct.failure!.code)});
  }
  expect(Object.keys(db)).toEqual(before);expect(m.rpc).not.toHaveBeenCalled();
 });
 it('memoizes the entire response, including computed_at, and coalesces concurrent reads',async()=>{
  const reads=vi.spyOn(db,'eligibleHistoryAsOf');
  const [a,b]=await Promise.all([get(),get()]);const aa=await a.json(),bb=await b.json();
  expect(aa).toEqual(bb);expect([a.headers.get('X-Macro-Presets-Memo'),b.headers.get('X-Macro-Presets-Memo')]).toEqual(['miss','hit']);
  expect(reads).toHaveBeenCalledTimes(14);
  const c=await get();expect(c.headers.get('X-Macro-Presets-Memo')).toBe('hit');expect(await c.json()).toEqual(aa);expect(reads).toHaveBeenCalledTimes(14);
  expect(reads).toHaveBeenCalledWith('US_FED_TARGET_UPPER_D',{to:'2026-11-01',asOf:cutoff,maxRows:20000});
  expect(reads).toHaveBeenCalledWith('US_FED_TARGET_LOWER_D',{to:'2026-11-01',asOf:cutoff,maxRows:20000});
 });
 it('returns no cards without a published snapshot',async()=>{
  vi.mocked(db.activeSnapshot).mockResolvedValue(null);
  const reads=vi.spyOn(db,'eligibleHistoryAsOf');expect(await (await get()).json()).toEqual({cards:[],reason:'no_published_snapshot'});expect(reads).not.toHaveBeenCalled();
 });
 it('auth precedes parameter validation; region and code version fail before db reads',async()=>{
  m.auth.mockResolvedValueOnce({ok:false,response:NextResponse.json({error:{code:'unauthenticated'}},{status:401})});
  expect((await get('region=bad')).status).toBe(401);
  for(const q of ['region=bad','region=US&region=CN',''])expect((await get(q)).status).toBe(400);
  for(const cv of [()=>null,()=>{throw Error('unavailable');}]){
   m.cv.mockImplementation(cv);const r=await get();expect(r.status).toBe(503);expect((await r.json()).error.code).toBe('code_version_unavailable');
  }
  expect(m.deps).not.toHaveBeenCalled();expect(m.cv).toHaveBeenCalledWith({allowGit:false});
 });
 it('a failed read is a card with a reason while other presets still compute',async()=>{
  vi.spyOn(db,'eligibleHistoryAsOf').mockImplementation(async id=>{if(id==='US_DFF')throw Error('database details');return [];});
  const body=await (await get()).json();expect(body.cards).toHaveLength(6);
  expect(body.cards[0]).toMatchObject({status:'failed',results:null,error:'read_failed'});expect(JSON.stringify(body)).not.toContain('database details');
 });
 it('does not memoize a transient card read failure and memoizes the recovered response',async()=>{
  const reads=vi.spyOn(db,'eligibleHistoryAsOf').mockRejectedValueOnce(Error('temporary database failure'));
  const first=await get();const body=await first.json();
  expect(first.headers.get('X-Macro-Presets-Memo')).toBe('miss');
  expect(body.cards.some((c:{error:string|null})=>c.error==='read_failed')).toBe(true);
  const retry=await get();const recovered=await retry.json();
  expect(retry.headers.get('X-Macro-Presets-Memo')).toBe('miss');
  expect(recovered.cards.every((c:{error:string|null})=>c.error!=='read_failed')).toBe(true);
  const readCount=reads.mock.calls.length;
  const cached=await get();
  expect(cached.headers.get('X-Macro-Presets-Memo')).toBe('hit');
  expect(await cached.json()).toEqual(recovered);expect(reads).toHaveBeenCalledTimes(readCount);
 });
 it.each([
  [new AnalysisError('invalid_inputs'),'invalid_inputs: invalid_inputs'],
  [new MacroDbError('truncated','too many rows'),'input_truncated'],
 ])('memoizes deterministic catch-branch failure %s',async(error,expected)=>{
  const reads=vi.spyOn(db,'eligibleHistoryAsOf').mockRejectedValue(error);
  const first=await get();const body=await first.json();
  expect(first.headers.get('X-Macro-Presets-Memo')).toBe('miss');
  expect(body.cards[0]).toMatchObject({status:'failed',error:expected});
  const readCount=reads.mock.calls.length;
  const cached=await get();
  expect(cached.headers.get('X-Macro-Presets-Memo')).toBe('hit');
  expect(await cached.json()).toEqual(body);expect(reads).toHaveBeenCalledTimes(readCount);
 });
 it('request ids are RFC 4122 v5, deterministic and unique across all eight presets',()=>{
  expect(new Set(PRESETS.map(p=>presetRequestId(p.id))).size).toBe(8);
  expect(presetRequestId('p1')).toBe('e61fbb40-f4e7-53e5-8b90-4e282e4ef3f2');
 });
});

it('all preset series are real catalog entries accepted by the shared validator',async()=>{
 const {validateAnalysisRequest}=await import('@/lib/macro/analysis-spec');
 for(const p of PRESETS)expect(validateAnalysisRequest({...p.form,request_id:presetRequestId(p.id)}).ok).toBe(true);
});
it('CN returns only its two presets with direct-service outputs',async()=>{
 const body=await (await get('region=CN')).json();expect(body.cards.map((c:{preset_id:string})=>c.preset_id)).toEqual(['p7','p8']);
 for(const p of PRESETS.filter(p=>p.region==='CN')){
  const direct=await prepareAnalysis({db},{...p.form,request_id:presetRequestId(p.id)},{cutoff,codeVersion:'c'.repeat(40),history:'eligible_as_of'});
  expect(body.cards.find((c:{preset_id:string})=>c.preset_id===p.id)).toMatchObject({inputs:direct.inputs,inputs_hash:direct.inputs_hash,data_hash:direct.data_hash,results:direct.results});
 }
});
it('successful cards match prepareAnalysis including rule explanations',async()=>{
 const {dataHash}=await import('@/lib/macro/analysis-spec');
 const rows=Array.from({length:60},(_,i)=>({observation_id:`o-${i}`,period_end:new Date(Date.UTC(2020, i+1, 0)).toISOString().slice(0,10),value_text:String(10+i*i/100)}));
 vi.spyOn(db,'eligibleHistoryAsOf').mockResolvedValue(rows as Awaited<ReturnType<typeof db.eligibleHistoryAsOf>>);
 const body=await (await get()).json();const p=PRESETS[0];
 const direct=await prepareAnalysis({db},{...p.form,request_id:presetRequestId(p.id)},{cutoff,codeVersion:'c'.repeat(40),history:'eligible_as_of'});
 expect(direct.failure).toBeNull();expect(body.cards[0]).toMatchObject({status:'ok',results:direct.results,data_hash:dataHash(direct.inputs)});
});
