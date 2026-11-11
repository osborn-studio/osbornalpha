import {afterEach,describe,expect,it,vi} from 'vitest';
import type {DigestReceipt} from './digest';

const ISSUER='33333333-3333-4333-8333-333333333333';
const REQUEST_ID='11111111-1111-4111-8111-111111111111';
const RAW_MESSAGE='private upstream error message';
const RAW_DETAIL='private upstream error detail';

afterEach(()=>{
 vi.restoreAllMocks();
 vi.unstubAllGlobals();
 vi.unstubAllEnvs();
});

async function runCli(evidenceResponse:()=>Response,args=['--apply','--limit','1']){
 vi.resetModules();
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.invalid');
 vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-key');
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA','a'.repeat(40));
 const info=vi.spyOn(console,'info').mockImplementation(()=>{});
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 const log=vi.spyOn(console,'log').mockImplementation(()=>{});
 let finish!:(code:unknown)=>void;
 const exited=new Promise<unknown>(resolve=>{finish=resolve;});
 vi.spyOn(process,'exit').mockImplementation(code=>{finish(code);return undefined as never;});
 const calls:{method:string;path:string;body:Record<string,unknown>|undefined}[]=[];
 let batch:Record<string,unknown>|undefined;
 const json=(value:unknown)=>Response.json(value);
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin!=='https://fixture.invalid')throw new Error('unexpected fixture origin');
  const path=url.pathname.replace(/^\/rest\/v1\//,'');
  const method=init?.method??'GET';
  const body=typeof init?.body==='string'?JSON.parse(init.body):undefined;
  calls.push({method,path,body});
  switch(`${method} ${path}`){
   case 'POST ingest_batches':batch=body;return json(batch);
   case 'GET ingest_batches':return json([batch]);
   case 'PATCH ingest_batches':return new Response(null,{status:204,headers:{'content-range':'0-0/1'}});
   case 'POST /storage/v1/object/list/disclosure-raw':
   case 'GET dq_freshness':return json([]);
   case 'GET issuer_securities':return json([{issuer_id:ISSUER,ticker:'AAPL',valid_from:'2000-01-01'}]);
   case 'GET issuers':return json([{issuer_id:ISSUER,status:'active'}]);
   case 'GET fact_sync_scope':return json([{issuer_id:ISSUER,market:'US',state_rev:1,next_due_at:'2000-01-01'}]);
   case 'POST dq_freshness':return new Response(null,{status:201});
   case 'POST rpc/company_digest_due':return json([{issuerId:ISSUER,market:'US',stateRev:1,digestedRev:0}]);
   case 'POST rpc/begin_company_digest_attempt':return json(1);
   case 'POST rpc/company_read_snapshot':return json({facts:{state_rev:1,rows:[],truncated:false},filings:[]});
   case 'POST rpc/replace_company_fact_evidence':return evidenceResponse();
   case 'POST rpc/mark_company_digest_failed':return json(true);
   case 'POST rpc/company_digest_backlog':return json(calls.some(c=>c.path==='rpc/mark_company_digest_failed')?1:0);
   case 'POST rpc/replace_company_digest':return json({upserted:0,changed:0,retired:0,revived:0});
   default:throw new Error(`unexpected fixture request: ${method} ${path}`);
  }
 });
 const argv=process.argv;
 process.argv=[process.execPath,'scripts/company/digest.ts','--market','US',...args];
 try{
  await import('../../../scripts/company/digest');
  const exitCode=await exited;
  expect(log).toHaveBeenCalledTimes(1);
  const output=String(log.mock.calls[0][0]);
  const events=[...info.mock.calls,...error.mock.calls].filter(c=>c[0]==='[company-digest]').map(c=>c[1]);
  return {exitCode,output,receipt:JSON.parse(output) as DigestReceipt,events,requests:calls,calls:(path:string)=>calls.filter(c=>c.path===`rpc/${path}`)};
 }finally{process.argv=argv;}
}

function failedResponse(id:string){
 return Response.json({code:'57014',message:RAW_MESSAGE,details:RAW_DETAIL,hint:RAW_DETAIL},{
  status:500,headers:{'sb-request-id':id,'x-request-id':RAW_DETAIL},
 });
}

describe('company digest CLI evidence writes',()=>{
 it('logs the validated ID privately and marks one failed attempt without exposing the upstream error',async()=>{
  const cli=await runCli(()=>failedResponse(REQUEST_ID));
  expect(cli.events.filter(e=>'upstream_request_id' in e)).toEqual([
   expect.objectContaining({stage:'evidence_replace',outcome:'failed',category:'query_canceled',upstream_request_id:REQUEST_ID}),
  ]);
  expect(cli.exitCode).toBe(1);
  expect(cli.receipt).toMatchObject({status:'failed',counts:{failed:1},detail:{backlogFailed:1},
   streams:[{issuerId:ISSUER,outcome:'failed',code:'evidence_index_failed',attemptId:1}]});
  expect(cli.calls('replace_company_fact_evidence')).toHaveLength(1);
  expect(cli.calls('mark_company_digest_failed')).toEqual([
   expect.objectContaining({body:expect.objectContaining({p_issuer:ISSUER,p_market:'US',p_attempt_id:1})}),
  ]);
  expect(cli.calls('replace_company_digest')).toHaveLength(0);
  for(const privateValue of [REQUEST_ID,RAW_MESSAGE,RAW_DETAIL])expect(cli.output).not.toContain(privateValue);
  for(const privateValue of [RAW_MESSAGE,RAW_DETAIL])expect(JSON.stringify(cli.events)).not.toContain(privateValue);
 });

 it.each([
  {name:'an invalid response ID',response:()=>failedResponse(RAW_DETAIL)},
  {name:'a network failure',response:()=>{throw new TypeError(RAW_MESSAGE);}},
 ])('omits request IDs and never replays the evidence POST after $name',async({response})=>{
  const cli=await runCli(response);
  expect(cli.exitCode).toBe(1);
  expect(cli.events.some(e=>'upstream_request_id' in e)).toBe(false);
  expect(cli.calls('replace_company_fact_evidence')).toHaveLength(1);
  expect(cli.calls('replace_company_digest')).toHaveLength(0);
  expect(cli.output).not.toContain(RAW_MESSAGE);
  expect(cli.output).not.toContain(RAW_DETAIL);
 });

 it('defaults to a dry run without writing a batch, attempt, evidence, or digest',async()=>{
  const cli=await runCli(()=>{throw new Error('unexpected evidence write');},['--limit','1']);
  expect(cli.exitCode).toBe(0);
  expect(cli.receipt).toMatchObject({status:'dry_run',batchId:null,streams:[{issuerId:ISSUER,outcome:'planned'}]});
  expect(cli.requests.map(c=>c.path)).toEqual([
   'rpc/company_digest_due','rpc/company_read_snapshot','/storage/v1/object/list/disclosure-raw','fact_sync_scope',
  ]);
 });

 it('resolves the ticker, publishes the digest after one successful evidence POST, and omits the response ID',async()=>{
  const cli=await runCli(
   ()=>Response.json({upserted:0,deleted:0},{headers:{'sb-request-id':REQUEST_ID}}),
   ['--apply','--full','--issuer','AAPL'],
  );
  expect(cli.exitCode,cli.output).toBe(0);
  expect(cli.receipt).toMatchObject({status:'success',streams:[{issuerId:ISSUER,outcome:'unchanged'}]});
  expect(cli.calls('replace_company_fact_evidence')).toHaveLength(1);
  expect(cli.calls('mark_company_digest_failed')).toHaveLength(0);
  expect(cli.calls('replace_company_digest')).toHaveLength(1);
  expect(cli.events.some(e=>'upstream_request_id' in e)).toBe(false);
  expect(cli.output).not.toContain(REQUEST_ID);
 });
});
