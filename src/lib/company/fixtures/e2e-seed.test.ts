// spec §12.3: local-only recorded replay; no live SEC enrichment or remote writes.
import {afterEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({admin:vi.fn(),production:vi.fn(),sync:vi.fn(),spawn:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:h.admin}));
vi.mock('@/lib/facts/deps',()=>({productionSyncDeps:h.production}));
vi.mock('@/lib/facts/sync',()=>({runFactsSync:h.sync}));
vi.mock('node:child_process',()=>({spawnSync:h.spawn}));
import {main} from '../../../../scripts/company/e2e-seed';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();});
function env(url:string){
 for(const [k,v] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:'local-key',E2E_EMAIL:'test@example.test',E2E_PASSWORD:'local-password',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)}))vi.stubEnv(k,v);
}
it('rejects remote URLs and invalid arguments before constructing an admin client',async()=>{
 env('https://production.example.com');
 await expect(main(['--apply'])).rejects.toThrow('refusing non-local');
 await expect(main([])).rejects.toThrow('usage:');
 expect(h.admin).not.toHaveBeenCalled();
});
it('replays recorded fixtures without live enrichment, then materializes, digests and clears only the fixture user watches',async()=>{
 env('http://127.0.0.1:54321');
 vi.spyOn(console,'log').mockImplementation(()=>{});
 const chain={select:vi.fn(),eq:vi.fn(),limit:vi.fn(),insert:vi.fn(),upsert:vi.fn(),delete:vi.fn()};
 chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);chain.delete.mockReturnValue(chain);
 chain.limit.mockResolvedValue({data:[{issuer_id:'issuer'}],error:null});chain.insert.mockResolvedValue({error:null});chain.upsert.mockResolvedValue({error:null});
 const from=vi.fn(()=>chain);
 h.admin.mockReturnValue({from,auth:{admin:{createUser:vi.fn().mockResolvedValue({data:{user:{id:'fixture-user'}}})}}});
 h.production.mockReturnValue({enrichAcceptance:()=>{throw new Error('live SEC request');}});
 h.sync.mockImplementation(async(deps,opts)=>{
  expect(deps.enrichAcceptance).toBeUndefined();
  expect(opts.issuerIds).toHaveLength(2);
  const snapshot=await deps.fetchUs('0000320193');
  expect(snapshot).toBeTruthy();
  await expect(deps.fetchUs('unknown')).rejects.toThrow();
  return {status:'success',detail:{failed:0},counts:{}};
 });
 h.spawn.mockReturnValue({status:0});
 await main(['--apply']);
 expect(h.sync).toHaveBeenCalledOnce();
 expect(h.spawn).toHaveBeenCalledTimes(2);
 expect(from).toHaveBeenCalledWith('company_watches');
 expect(chain.eq).toHaveBeenCalledWith('user_id','fixture-user');
});
