// Topic spec §4.1 production source boundaries (plan T2.7).
import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {TableClient} from '@/lib/db/table-client';
import {productionSources} from './production-sources';
import {factFixture,FACT} from './fixtures/facts';
const stub=vi.hoisted(()=>({select:vi.fn(async()=>[]),gate:vi.fn(async()=>({eligibility:new Map()}))}));
vi.mock('@/lib/db/table-client',async original=>({...await original<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>({select:stub.select} as unknown as TableClient)}));
vi.mock('@/lib/company/evidence-gate',async original=>({...await original<typeof import('@/lib/company/evidence-gate')>(),gateFacts:stub.gate}));
const source=()=>productionSources({admin:{} as SupabaseClient});
beforeEach(()=>{stub.select.mockReset().mockResolvedValue([]);stub.gate.mockClear();});
it('macro rows read by identity with no status match',async()=>{
 await source().macro.rows(['10000000-0000-4000-8000-000000000001']);
 expect(stub.select).toHaveBeenCalled();
 for(const call of stub.select.mock.calls as unknown as [string,Record<string,unknown>][]){
  expect(call[0]).toBe('macro_observations');expect(call[1]).not.toHaveProperty('status');
  expect(call[1]).toHaveProperty('observation_id','10000000-0000-4000-8000-000000000001');
 }
});
it('groups fact gating by issuer and market and excludes HK',async()=>{
 const rows=factFixture().facts!.infos!.map(i=>i.row);
 const second={...rows.find(r=>r.fact_id===FACT.usOk)!,issuer_id:'30000000-0000-4000-8000-000000000099',fact_id:'30000000-0000-4000-8000-000000000098'};
 await source().facts.eligibility([...rows,second],{admin:false});
 expect(stub.gate).toHaveBeenCalledTimes(3);
 const inputs=stub.gate.mock.calls as unknown as [unknown,{issuerId:string;market:string;facts:Map<string,unknown>;factIds:string[];admin:boolean}][];
 expect(inputs.map(([,i])=>[i.issuerId,i.market]).sort()).toEqual([[rows[0].issuer_id,'CN'],[rows[0].issuer_id,'US'],[second.issuer_id,'US']].sort());
 for(const [,input] of inputs){expect(input.market).not.toBe('HK');expect(input.factIds).not.toContain(FACT.hk);expect(input.admin).toBe(false);}
});
it('returns unknown when the freshness dataset has no row',async()=>{
 const now=new Date('2026-11-15T00:00:00.000Z');
 expect(await source().freshness('macro.fred',now)).toEqual({dataset:'macro.fred',status:'unknown',checked_at:now.toISOString()});
});
it('uses the supported latest public judgment view',async()=>{
 const calls:{fn:string;args:Record<string,unknown>}[]=[];
 const admin={rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});return {data:[],error:null};}} as unknown as SupabaseClient;
 expect(await productionSources({admin}).judgments.judgment('50000000-0000-4000-8000-000000000001')).toBeNull();
 expect(calls).toEqual([{fn:'judgment_envelope_by_id',args:{p_id:'50000000-0000-4000-8000-000000000001',p_view:'latest',p_cutoff:null}}]);
});
