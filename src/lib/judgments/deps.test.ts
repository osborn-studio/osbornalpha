// src/lib/judgments/deps.test.ts
// F4 Task 14: code_version resolution for the settle cron (Vercel: only a full VERCEL_GIT_COMMIT_SHA) and scripts
// (env, then `git rev-parse HEAD`, "-dirty" when the tree has changes); a failing or malformed git → null.
import {describe,expect,it} from 'vitest';
import {resolveCodeVersion} from './deps';

const SHA='0123456789abcdef0123456789abcdef01234567';
describe('resolveCodeVersion',()=>{
 it('takes a full 40-hex VERCEL_GIT_COMMIT_SHA in both modes and never runs git for it',()=>{
  const exec=()=>{throw new Error('git must not run');};
  expect(resolveCodeVersion({allowGit:false,env:{VERCEL_GIT_COMMIT_SHA:SHA},exec})).toBe(SHA);
  expect(resolveCodeVersion({allowGit:true,env:{VERCEL_GIT_COMMIT_SHA:SHA},exec})).toBe(SHA);
 });
 it('cron mode (allowGit=false) refuses anything else',()=>{
  expect(resolveCodeVersion({allowGit:false,env:{}})).toBeNull();
  expect(resolveCodeVersion({allowGit:false,env:{VERCEL_GIT_COMMIT_SHA:'abc123'}})).toBeNull();
 });
 it('script mode falls back to git HEAD, with -dirty for a changed tree; git failure or a bad HEAD → null',()=>{
  const git=(status:string)=>(cmd:string,args:string[])=>{expect(cmd).toBe('git');return args[0]==='rev-parse'?`${SHA}\n`:status;};
  expect(resolveCodeVersion({allowGit:true,env:{},exec:git('')})).toBe(SHA);
  expect(resolveCodeVersion({allowGit:true,env:{},exec:git(' M src/x.ts\n')})).toBe(`${SHA}-dirty`);
  expect(resolveCodeVersion({allowGit:true,env:{},exec:()=>{throw new Error('not a repo');}})).toBeNull();
  expect(resolveCodeVersion({allowGit:true,env:{},exec:()=>'HEAD\n'})).toBeNull();
 });
});
