// src/app/api/admin/judgments/queue/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),queueList:vi.fn(),getJudgment:vi.fn(),settlementsOf:vi.fn(),serverTime:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/judgments/db',()=>({supabaseJudgmentsDb:()=>({queueList:mocks.queueList,getJudgment:mocks.getJudgment,settlementsOf:mocks.settlementsOf,serverTime:mocks.serverTime})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';
import {AdminForbidden} from '@/lib/admin/auth';

const get=(qs='')=>GET(new Request(`https://alpha.example/api/admin/judgments/queue?${qs}`));
const row=(n:number)=>({judgment_id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`});

describe('GET /api/admin/judgments/queue',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:'a'});mocks.queueList.mockResolvedValue([row(1),row(2)]);
  mocks.serverTime.mockResolvedValue('2026-11-06T00:00:00.000Z');
  mocks.getJudgment.mockImplementation(async(id:string)=>({judgment_id:id,subject_type:'issuer',subject_key:'k',methodology_id:'m',methodology_version:'v1',target:null}));
  mocks.settlementsOf.mockResolvedValue([{judgment_id:row(1).judgment_id,seq:1,kind:'void',outcome:null,settled_at:'2026-11-01T00:00:00.000Z'},{judgment_id:row(1).judgment_id,seq:2,kind:'reopened',outcome:null,settled_at:'2026-11-02T00:00:00.000Z'}]);
 });
 it('defaults to due / 100, keyset after, next_after on any non-empty page (null only when empty; P1-02), joined judgment + latest settlement, counts, now; never cached',async()=>{
  const res=await get();
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body=await res.json();
  expect(body).toMatchObject({filter:'due',next_after:row(2).judgment_id,now:'2026-11-06T00:00:00.000Z',counts:{due:2,backoff:2,leased:2}});
  expect(body.rows).toEqual([
   {...row(1),judgment:{subject_type:'issuer',subject_key:'k',methodology_id:'m',methodology_version:'v1',target:null},latest_settlement:{kind:'reopened',outcome:null,settled_at:'2026-11-02T00:00:00.000Z'}},
   {...row(2),judgment:{subject_type:'issuer',subject_key:'k',methodology_id:'m',methodology_version:'v1',target:null},latest_settlement:null}]);
  expect(mocks.queueList).toHaveBeenCalledWith({filter:'due',limit:100,after:undefined});
  const full=await (await get(`filter=leased&limit=2&after=${row(0).judgment_id}`)).json();
  expect(full.next_after).toBe(row(2).judgment_id);
  expect(mocks.queueList).toHaveBeenCalledWith({filter:'leased',limit:2,after:row(0).judgment_id});
  mocks.queueList.mockResolvedValueOnce([]);
  expect((await (await get(`after=${row(2).judgment_id}`)).json()).next_after).toBeNull();
 });
 it('validates parameters and requires an admin',async()=>{
  for(const qs of ['filter=x','limit=501','after=x','filter=due&filter=all'])expect((await get(qs)).status,qs).toBe(400);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
  expect((await get()).status).toBe(403);
 });
});
