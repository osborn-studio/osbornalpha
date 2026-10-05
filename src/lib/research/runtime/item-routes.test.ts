import {Pool,Client} from 'pg';
import {it,expect,vi,afterEach} from 'vitest';
import {researchConfig} from './config';
import {GET as status} from '../../../app/api/research/s4/candidates/[id]/status/route';
import {POST as reveal} from '../../../app/api/research/s4/candidates/[id]/reveal/route';
import {POST as decisions} from '../../../app/api/research/s4/candidates/[id]/decisions/route';
import {POST as history} from '../../../app/api/research/s4/candidates/[id]/history/route';
import {POST as citation} from '../../../app/api/research/s4/candidates/[id]/citation/route';
const owner='10000000-0000-4000-8000-000000000001';
const local={ALPHA_S4_ENABLED:'1',ALPHA_S4_DATABASE_URL:'postgres://app:synthetic@127.0.0.1:5432/local'};
const production={...local,ALPHA_RESEARCH_RUNTIME_MODE:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),ALPHA_S4_RELEASE_SHA:'a'.repeat(40),ALPHA_S4_ORIGIN:'https://alpha.example.test',ALPHA_S4_DATABASE_URL:'postgres://research_app:synthetic@db.example.test:6543/research',ALPHA_S4_DB_HOST:'db.example.test',ALPHA_S4_DB_PORT:'6543',ALPHA_S4_DB_NAME:'research',ALPHA_S4_DB_ROLE:'research_app',ALPHA_S4_OWNER_IDS:owner};

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each([undefined,'1'])('production item routes remain disabled before connection with enabled=%s',async enabled=>{
 for(const [key,value]of Object.entries(production))vi.stubEnv(key,value);
 vi.stubEnv('ALPHA_S4_LOCAL_AUTH',undefined);vi.stubEnv('ALPHA_S4_LOCAL_SESSION_SECRET',undefined);
 expect(researchConfig().mode).toBe('production');
 vi.stubEnv('ALPHA_S4_ENABLED',enabled);
 const pool=vi.spyOn(Pool.prototype,'connect').mockImplementation(()=>{throw Error('must not connect');});
 const client=vi.spyOn(Client.prototype,'connect').mockImplementation(()=>{throw Error('must not connect');});
 for(const handler of [status,reveal,decisions,history,citation]){
  const response=await handler(new Request('https://alpha.example.test/api/research/s4/candidates/'+owner+'/status'),{params:Promise.resolve({id:owner})});
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:'not_configured'}});
 }
 expect(pool).not.toHaveBeenCalled();expect(client).not.toHaveBeenCalled();
});
