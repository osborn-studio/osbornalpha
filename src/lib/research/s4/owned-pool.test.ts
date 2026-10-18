import {afterEach,describe,expect,it,vi} from 'vitest';
import {ownedPool} from '../../../../scripts/s4/local-db';
// pg-pool re-emits an idle client's error on the pool; without a listener Node throws.
// An owned cluster stopped synchronously right after pool.end() can still deliver
// FATAL 57P01 to a half-closed client (CI run 39001710702).
describe('owned acceptance pools survive late backend termination',()=>{
 afterEach(()=>{vi.restoreAllMocks();});
 it('attaches exactly one error listener and reports only the SQLSTATE, never the message or target',()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const pool=ownedPool({host:'127.0.0.1',port:1,user:'s4_admin',password:'synthetic-secret',database:'postgres'});
  expect(pool.listenerCount('error')).toBe(1);
  expect(()=>pool.emit('error',Object.assign(new Error('terminating connection due to administrator command synthetic-secret'),{code:'57P01'}))).not.toThrow();
  expect(log).toHaveBeenCalledTimes(1);
  const printed=JSON.stringify(log.mock.calls);
  expect(printed).toContain('57P01');
  expect(printed).not.toMatch(/synthetic-secret|administrator command|127\.0\.0\.1/);
  expect(()=>pool.emit('error',new Error('no sqlstate'))).not.toThrow();
  expect(JSON.stringify(log.mock.calls[1])).toContain('unknown');
 });
});
