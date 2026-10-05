import {GET as machineObservation} from '../../../app/api/evaluator/v1/observations/[id]/route';
import {GET as machineMarket} from '../../../app/api/evaluator/v1/market-snapshots/[id]/route';
import {POST as machineCommit} from '../../../app/api/evaluator/v1/evaluation-results/route';
import {POST as observationReport} from '../../../app/api/research/s6/observations/[id]/route';
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
 for(const s6Enabled of [undefined,'1']){
  vi.stubEnv('ALPHA_S6_ENABLED',s6Enabled);
  for(const body of [{action:'read'},{action:'replay',evaluationId:owner},{action:'prepare'},{action:'evaluate',asOf:'2026-10-05T00:00:00Z',key:'synthetic-production-gate',revision:0,marketIds:[]}]){
   const response=await observationReport(new Request('https://alpha.example.test/api/research/s6/observations/'+owner,{method:'POST',headers:{host:'alpha.example.test',origin:'https://alpha.example.test','content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:owner})});
   expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:'not_configured'}});expect(response.headers.get('cache-control')).toBe('no-store');
  }
 }
 // Machine transport is loopback-only even with otherwise valid production configuration.
 const headers={host:'alpha.example.test',authorization:'Bearer '+owner+'.'+'1'.repeat(64),'x-evaluator-protocol':'evaluator-rpc/1.0'};
 for(const handler of [machineObservation,machineMarket]){
  const response=await handler(new Request('https://alpha.example.test/api/evaluator/v1/observations/'+owner,{headers}),{params:Promise.resolve({id:owner})});
  expect(response.status).toBe(403);expect(await response.json()).toEqual({error:{code:'scope_denied'}});expect(response.headers.get('cache-control')).toBe('no-store');
 }
 const denied=await machineCommit(new Request('https://alpha.example.test/api/evaluator/v1/evaluation-results',{method:'POST',headers,body:'{}'}));
 expect(denied.status).toBe(403);expect(await denied.json()).toEqual({error:{code:'scope_denied'}});expect(denied.headers.get('cache-control')).toBe('no-store');
 expect(pool).not.toHaveBeenCalled();expect(client).not.toHaveBeenCalled();
});
