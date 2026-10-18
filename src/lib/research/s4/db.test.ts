import {afterEach,expect,it,vi} from 'vitest';
import {s4Pool,closeS4Pool} from './db';
const local={ALPHA_S4_ENABLED:'1',ALPHA_S4_DATABASE_URL:'postgres://app:synthetic-secret@127.0.0.1:5432/local'};
afterEach(async()=>{await closeS4Pool();vi.restoreAllMocks();vi.unstubAllEnvs();});
it('research pool does not crash the process on an idle client error and logs only the SQLSTATE',()=>{
 for(const [k,v] of Object.entries(local))vi.stubEnv(k,v);
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const pool=s4Pool();
 expect(pool.listenerCount('error')).toBe(1);
 expect(()=>pool.emit('error',Object.assign(new Error('terminating connection due to administrator command synthetic-secret'),{code:'57P01'}))).not.toThrow();
 expect(log).toHaveBeenCalledTimes(1);
 const printed=JSON.stringify(log.mock.calls);
 expect(printed).toContain('57P01');
 expect(printed).not.toMatch(/synthetic-secret|administrator command|127\.0\.0\.1/);
});
