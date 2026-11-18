import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';

vi.mock('server-only',()=>({}));
const {cached,fixture,enabled}=vi.hoisted(()=>({
 cached:vi.fn<()=>Promise<boolean>>(),
 fixture:vi.fn<()=>boolean>(),
 enabled:vi.fn<()=>boolean>(),
}));
vi.mock('next/cache',()=>({unstable_cache:()=>cached}));
vi.mock('./e2e-fixture',()=>({fixtureMode:fixture}));
vi.mock('./flags',()=>({topicsEnabled:enabled}));
import {createTopicsPublicEnabledReader as reader,readTopicsPublicEnabled} from './public-flag';

it('closes immediately when disabled even with a cached true',async()=>{
 fixture.mockReturnValue(false);
 enabled.mockReturnValue(false);
 cached.mockReset().mockResolvedValue(true);
 expect(await readTopicsPublicEnabled()).toBe(false);
 expect(cached).not.toHaveBeenCalled();
});

it('opens in fixture mode without consulting the cache',async()=>{
 fixture.mockReturnValue(true);
 enabled.mockReturnValue(false);
 cached.mockReset().mockResolvedValue(false);
 expect(await readTopicsPublicEnabled()).toBe(true);
 expect(cached).not.toHaveBeenCalled();
});

it('uses the cached setting when enabled and fails closed if the cache throws',async()=>{
 fixture.mockReturnValue(false);
 enabled.mockReturnValue(true);
 cached.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(Error('offline'));
 expect(await readTopicsPublicEnabled()).toBe(true);
 expect(await readTopicsPublicEnabled()).toBe(false);
 expect(await readTopicsPublicEnabled()).toBe(false);
});

it('skips unconfigured storage and reads configured storage',async()=>{
 const read=vi.fn(async()=>({public_enabled:true}));
 expect(await reader(()=>false,read)()).toBe(false);
 expect(read).not.toHaveBeenCalled();
 expect(await reader(()=>true,read)()).toBe(true);
});

it('requires an explicit public switch and fails closed on a read error',async()=>{
 for(const value of [null,{public_enabled:false}]){
  expect(await reader(()=>true,async()=>value)()).toBe(false);
 }
 expect(await reader(()=>true,async()=>{throw Error('offline');})()).toBe(false);
});

it('wires the topic reader into layout availability inside its fence',()=>{
 const layout=readFileSync('src/app/(app)/layout.tsx','utf8');
 expect(layout).toMatch(/\/\/ TOPICS ↓(?:(?!\/\/ TOPICS ↑)[\s\S])*topic: await readTopicsPublicEnabled\(\)[^\n]*\n\s*\/\/ TOPICS ↑/);
});
