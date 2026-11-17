import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({unstable_cache:(fn:()=>Promise<boolean>,_keys:string[],options:{revalidate:number})=>{expect(options.revalidate).toBe(60);return fn;}}));
import {createForeignPublicEnabledReader,readForeignPublicEnabled} from './public-flag';
import {DEFAULT_CHAIN_AVAILABILITY,chainItems} from '@/components/research-ui/chain';
it.each([true,false])('reads the public flag %s and wires chain availability',async flag=>{
 const foreign=await createForeignPublicEnabledReader(()=>true,async()=>({public_enabled:flag}))();
 expect(foreign).toBe(flag);
 const items=chainItems('/intel/foreign-research',{...DEFAULT_CHAIN_AVAILABILITY,foreign});
 expect(items.find(i=>i.id==='foreign')?.state).toBe(flag?'current':'notServed');
});
it('fails closed for missing row, read error, configuration error and unconfigured storage',async()=>{
 const reader=vi.fn(async()=>({public_enabled:true}));
 expect(await createForeignPublicEnabledReader(()=>false,reader)()).toBe(false);expect(reader).not.toHaveBeenCalled();
 expect(await createForeignPublicEnabledReader(()=>true,async()=>null)()).toBe(false);
 expect(await createForeignPublicEnabledReader(()=>true,async()=>{throw Error('db');})()).toBe(false);
 expect(await createForeignPublicEnabledReader(()=>{throw Error('config');},reader)()).toBe(false);
});
it('fails closed without Supabase credentials',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');
 try{expect(await readForeignPublicEnabled()).toBe(false);}finally{vi.unstubAllEnvs();}
});
it('passes the cached flag to the shared chain in the layout',()=>{
 const src=readFileSync('src/app/(app)/layout.tsx','utf8');
 expect(src).toMatch(/foreign:\s*await readForeignPublicEnabled\(\)/);
 expect(src).toContain('<ResearchChain availability={availability}');
});
