import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:{id:'me'}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:m.single})})})})}));
import {GET} from '../[runId]/route';
import {freezeInputs,dataHash} from '@/lib/macro/analysis-spec';
import {catalogById} from '@/lib/macro/catalog';
it('adds a data_hash derived from stored frozen inputs without database schema changes',async()=>{
 const inputs=freezeInputs({indicator:catalogById('US_DFF')!,asset:catalogById('US_UST10Y')!,indicatorRows:[],assetRows:[],cutoff:'2026-11-01T00:00:00Z',catalogVersion:'v'});
 m.single.mockResolvedValue({data:{inputs},error:null});
 const r=await GET(new Request('https://x'),{params:Promise.resolve({runId:'9d0c1a8e-1f2b-4c3d-8e4f-5a6b7c8d9e0f'})});
 expect((await r.json()).run.data_hash).toBe(dataHash(inputs));
});
