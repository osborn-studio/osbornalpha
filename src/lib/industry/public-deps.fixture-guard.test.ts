// src/lib/industry/public-deps.fixture-guard.test.ts
// Codex task20 challenge P2: fixture mode must fail closed — only an isolated local test server
// (flag on, not production, not Vercel, no Supabase credentials) may swap in synthetic deps.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const spies=vi.hoisted(()=>({read:vi.fn(),replay:vi.fn(),valuation:vi.fn()}));
vi.mock('next/cache',()=>({unstable_cache:<T>(fn:T)=>fn}));
vi.mock('./e2e-fixture',async()=>{
 const actual=await vi.importActual<typeof import('./e2e-fixture')>('./e2e-fixture');
 return {...actual,fixtureReadDeps:(...a:unknown[])=>{spies.read(...a);return {} as never;},fixtureReplayDeps:(...a:unknown[])=>{spies.replay(...a);return {} as never;},
  fixtureValuationReplayDeps:(...a:unknown[])=>{spies.valuation(...a);return {} as never;}};
});
import {fixtureMode} from './e2e-fixture';
import {adminReadDeps,publicReadDeps,replayDeps,valuationReplayDeps} from './public-deps';

const ISOLATED={INDUSTRY_E2E_FIXTURES:'1',NODE_ENV:'development'};
const MATRIX:[string,Record<string,string|undefined>,boolean][]=[
 ['isolated local test server',ISOLATED,true],
 ['NODE_ENV unset',{INDUSTRY_E2E_FIXTURES:'1'},true],
 ['flag unset',{NODE_ENV:'development'},false],
 ['flag not 1',{INDUSTRY_E2E_FIXTURES:'true',NODE_ENV:'development'},false],
 ['production',{...ISOLATED,NODE_ENV:'production'},false],
 ['on Vercel',{...ISOLATED,VERCEL:'1'},false],
 ['Supabase URL configured',{...ISOLATED,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'},false],
 ['service role key configured',{...ISOLATED,SUPABASE_SERVICE_ROLE_KEY:'k'},false],
];
const KEYS=['INDUSTRY_E2E_FIXTURES','NODE_ENV','VERCEL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];

describe('fixture mode env matrix',()=>{
 beforeEach(()=>{for(const k of KEYS)vi.stubEnv(k,undefined as unknown as string);vi.clearAllMocks();});
 afterEach(()=>{vi.unstubAllEnvs();});
 it.each(MATRIX)('fixtureMode: %s',(_n,env,expected)=>{expect(fixtureMode(env)).toBe(expected);});
 it.each(MATRIX)('every factory: %s',(_n,env,expected)=>{
  for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else vi.stubEnv(k,v);}
  const attempt=(f:()=>unknown)=>{try{f();}catch{/* real deps need credentials; only the fixture call matters */}};
  attempt(()=>publicReadDeps(new Date()));attempt(()=>adminReadDeps(new Date()));attempt(()=>replayDeps(new Date()));attempt(()=>valuationReplayDeps());
  const n=expected?1:0;
  expect(spies.read).toHaveBeenCalledTimes(n*2);   // publicReadDeps + adminReadDeps
  expect(spies.replay).toHaveBeenCalledTimes(n);
  expect(spies.valuation).toHaveBeenCalledTimes(n);
 });
});
