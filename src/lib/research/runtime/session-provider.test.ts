import {it,expect,vi,beforeEach} from 'vitest';
import {requireResearchUser,ResearchForbidden} from '../store';
import {getServerSupabase} from '@/lib/supabase/server';
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn()}));
const userId='10000000-0000-4000-8000-000000000001';
const getUser=vi.fn(),getSession=vi.fn(),maybeSingle=vi.fn(),eq=vi.fn(),select=vi.fn(),from=vi.fn();
beforeEach(()=>{
 vi.resetAllMocks();getUser.mockResolvedValue({data:{user:{id:userId}},error:null});maybeSingle.mockResolvedValue({data:{role:'admin'},error:null});
 eq.mockReturnValue({maybeSingle});select.mockReturnValue({eq});from.mockReturnValue({select});
 vi.mocked(getServerSupabase).mockResolvedValue({auth:{getUser,getSession},from} as unknown as Awaited<ReturnType<typeof getServerSupabase>>);
});
it('uses server-verified identity then its profile, never a cached session claim',async()=>{
 expect((await requireResearchUser()).userId).toBe(userId);expect(getUser).toHaveBeenCalledOnce();expect(getSession).not.toHaveBeenCalled();expect(from).toHaveBeenCalledWith('profiles');expect(eq).toHaveBeenCalledWith('id',userId);
});
it.each([{data:{user:null},error:null},{data:{user:{id:userId}},error:{message:'expired'}}])('rejects absent or rejected user before profiles',async result=>{
 getUser.mockResolvedValue(result);await expect(requireResearchUser()).rejects.toThrow('not authenticated');expect(from).not.toHaveBeenCalled();
});
it.each([null,{role:'user'},{role:null}])('rejects missing/non-admin profiles',async profile=>{
 maybeSingle.mockResolvedValue({data:profile,error:null});await expect(requireResearchUser()).rejects.toBeInstanceOf(ResearchForbidden);
});
it('fails closed on profile query failure',async()=>{
 maybeSingle.mockResolvedValue({data:{role:'admin'},error:{message:'synthetic unavailable'}});await expect(requireResearchUser()).rejects.toThrow();
});
