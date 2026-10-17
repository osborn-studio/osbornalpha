/**
 * Closed-loop rehearsal, Alpha stage (local only; 2026-09-26).
 *   npx tsx scripts/rehearsal/alpha-stage.ts <s4-state.json> <candidate-pack.json> <alpha-trusted-config.json> <postgrest-bin> <out-dir>
 * Stations: S4 import of the PA candidate pack → cards → decision(observe) → outbox receipts →
 *   A2 entity keys + thesis (via real PostgREST) → A6 fan-out (rule backend only; external models denied) →
 *   A3 ledger decision citing judgments → S6 synthetic market freeze → evaluator commit → replay check.
 * Writes stage receipts (no secrets) to <out-dir>/alpha-stage.json. Never touches production.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer,request as httpRequest,type Server} from 'node:http';
import {Pool} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {importCandidate} from '../../src/lib/research/s4/import';
import {revealCards} from '../../src/lib/research/s4/cards';
import {submitDecision} from '../../src/lib/research/s4/decisions';
import {drainOutbox} from '../../src/lib/research/s4/anchor';
import {closeS4Pool,transaction} from '../../src/lib/research/s4/db';
import {recordDecision,replayJudgments} from '../../src/lib/research/s4/ledger';
import {seedEntityKeys} from '../../src/lib/research/entity-keys/seed';
import {entityTableVersion,listEntityKeys} from '../../src/lib/research/entity-keys/store';
import {createThesis,transitionThesis} from '../../src/lib/research/theses';
import {listSources} from '../../src/lib/research/sources';
import {ingestVersioned} from '../../src/lib/research/ingest/collectors/write';
import {runFanout} from '../../src/lib/research/fanout/run';
import {ruleBackend} from '../../src/lib/research/fanout/backends/rule';
import {loadReportRows} from '../../src/lib/research/fanout/report-db';
import {renderMarkdown,summarize} from '../../src/lib/research/fanout/report';
import {freezeMarket} from '../../src/lib/research/s6/market';
import {createS6Store,makeCommit,prepareEvaluation,prepareInput} from '../../src/lib/research/s6/store';
import {syntheticMapping} from '../s6/fixtures';
import {replayObservation} from 'dsh-trade-strategy-evaluator/engine';
import type {ResearchCtx} from '../../src/lib/research/store';

const [statePath,packPath,configPath,postgrestBin,outDir,...flags]=process.argv.slice(2);
// --synthetic-binding: mark the S4 binding synthetic so the frozen S6 engine accepts the observation (real issuer identity is gated until E2/E3).
const syntheticBinding=flags.includes('--synthetic-binding');
if(!statePath||!packPath||!configPath||!postgrestBin||!outDir) throw new Error('usage: alpha-stage.ts <state.json> <candidate-pack.json> <trusted-config.json> <postgrest> <out-dir>');
const state=JSON.parse(readFileSync(statePath,'utf8'));
if(new URL(state.adminUrl).hostname!=='127.0.0.1'||!state.directory.includes('alpha-s4-db-')) throw new Error('local_acceptance_only');
Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
const admin=new Pool({connectionString:state.adminUrl});
const actor={userId:randomUUID(),kind:'agent' as const};
const stages:Array<{station:string;status:'passed'|'failed'|'blocked';detail:Record<string,unknown>}>=[];
const stage=async(station:string,fn:()=>Promise<Record<string,unknown>>)=>{try{const detail=await fn();stages.push({station,status:'passed',detail});console.log('PASS',station);}catch(e){const message=e instanceof Error?e.message:String(e);const frames=(e instanceof Error?e.stack??'':'').split('\n').filter(l=>l.includes('/src/')).slice(0,4);stages.push({station,status:'failed',detail:{error:message,frames}});console.log('FAIL',station,message,frames.join(' | '));}};
const b64=(o:unknown)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=(secret:string,claims:Record<string,unknown>)=>{const h=b64({alg:'HS256',typ:'JWT'}),p=b64(claims);return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;};
let postgrest:ChildProcess|null=null;let gateway:Server|null=null;
async function main(){
 mkdirSync(outDir,{recursive:true,mode:0o700});
 const pack=JSON.parse(readFileSync(packPath,'utf8')),config=JSON.parse(readFileSync(configPath,'utf8'));
 await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,`${actor.userId}@rehearsal.test`]);
 await admin.query("update public.profiles set role='admin' where id=$1",[actor.userId]);
 let candidateId='',observationId='',decisionId='',sourceIdFromPa='';
 await stage('S4 import: PA candidate pack → controlled copy + candidate',async()=>{
  const binding={localUserId:actor.userId,upstreamScope:pack.manifest.owner_scope,trustedConfig:config,synthetic:syntheticBinding,revoked:false,approvedPayloadHash:pack.manifest.payload_digest,approvedManifestHash:pack.manifest.manifest_digest??null};
  const {digest}=await import('../../src/lib/research/ingest/pa-v1/json.js');
  (binding as any).approvedManifestHash=digest(pack.manifest);
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,binding.approvedPayloadHash,binding]);
  const raw=JSON.stringify(pack);
  const first=await importCandidate(actor,raw),again=await importCandidate(actor,raw);
  candidateId=first.id;
  const src=(await admin.query('select id,source_type,metadata from research_source_documents where user_id=$1',[actor.userId])).rows[0];
  sourceIdFromPa=src.id;
  return {candidate_id:first.id,duplicate_on_retry:again.duplicate,controlled_copy_source:{id:src.id,source_type:src.source_type,metadata:src.metadata},payload_digest:pack.manifest.payload_digest};
 });
 await stage('S4 cards → decision(observe) → observation record',async()=>{
  // A synthetic binding may only observe a synthetic security (decisions.ts); a real binding observes the real ticker.
  await admin.query(syntheticBinding
   ? `insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('REHSYNTH','Rehearsal synthetic security','US','XNYS','USD','{"synthetic":true,"rehearsal":true}') on conflict do nothing`
   : `insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('PLTR','Palantir Technologies Inc.','US','XNYS','USD','{"rehearsal":true}') on conflict do nothing`);
  const cards=await revealCards(actor,candidateId,{requestKey:randomUUID(),judgment:'闭环演练：公开 8-K 文本，代理操作，无独立投研判断。',alreadySeen:['closed-loop rehearsal'],independentJudgment:false});
  const d=await submitDecision(actor,candidateId,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'演练：建立观察，等待行情。',cardId:cards.cards[0].id,labelId:cards.labelId,exposureId:cards.exposureId,securityTicker:syntheticBinding?'REHSYNTH':'PLTR',companyEntityId:null,newObservation:true,reviewAt:null});
  observationId=d.observationId;decisionId=d.decisionId;
  return {cards:cards.cards.length,recall_reason:cards.cards[0].payload.recall_reason,decision_id:d.decisionId,observation_id:d.observationId};
 });
 await stage('S4 outbox → anchored receipts',async()=>{
  const receiptRoot=join(outDir,'receipts');mkdirSync(receiptRoot,{recursive:true,mode:0o700});
  let remaining=1,rounds=0;while(remaining&&rounds<10){remaining=(await drainOutbox(actor,receiptRoot)).remaining;rounds++;}
  const st=(await admin.query('select status,anchor_status from research_s4_observation_state where user_id=$1',[actor.userId])).rows;
  return {rounds,remaining,observation_state:st};
 });
 // Real PostgREST over the same local database for the Supabase-client paths (A2/A6/theses).
 const secret=randomBytes(32).toString('hex'),port=54000+Math.floor(Math.random()*1000);
 const authPassword=randomBytes(16).toString('hex');
 await admin.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='rehearsal_auth') then create role rehearsal_auth login noinherit; end if; end $$; alter role rehearsal_auth password '${authPassword}'; grant anon,authenticated,service_role to rehearsal_auth;`);
 // Supabase grants service_role full table access; the isolated database only created the role.
 await admin.query('grant usage on schema public to service_role, authenticated, anon; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant select, insert, update, delete on all tables in schema public to authenticated;');
 const u=new URL(state.adminUrl);
 const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'development',PATH:process.env.PATH??'',PGRST_DB_URI:`postgres://rehearsal_auth:${authPassword}@127.0.0.1:${u.port}/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:String(port),PGRST_SERVER_HOST:'127.0.0.1',PGRST_LOG_LEVEL:'error'};
 const child:ChildProcess=spawn(postgrestBin,[],{env,stdio:'pipe'});postgrest=child;
 let pgrstLog='';child.stdout?.on('data',(d:Buffer)=>pgrstLog+=String(d));child.stderr?.on('data',(d:Buffer)=>pgrstLog+=String(d));
 for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${port}/`);if(r.status<500)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 // supabase-js speaks /rest/v1/…; standalone PostgREST serves at /. Same gateway shape as the PA S3.4 walkthrough.
 gateway=createServer((req,res)=>{
  if(!req.url?.startsWith('/rest/v1/')){res.writeHead(404);return res.end('{}');}
  const up=httpRequest(`http://127.0.0.1:${port}`+req.url.slice('/rest/v1'.length),{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode??502,r.headers);r.pipe(res);});
  up.on('error',()=>{res.writeHead(502);res.end();});req.pipe(up);
 });
 await new Promise<void>(r=>gateway!.listen(0,'127.0.0.1',()=>r()));
 const gatewayUrl=`http://127.0.0.1:${(gateway.address() as {port:number}).port}`;
 const serviceJwt=jwt(secret,{role:'service_role',iss:'rehearsal',exp:Math.floor(Date.now()/1000)+3600});
 const ctx:ResearchCtx={supabase:createClient(gatewayUrl,serviceJwt,{auth:{persistSession:false}}) as any,userId:actor.userId};
 let thesisId='';
 await stage('A2 entity keys via real PostgREST (21 companies) + entity_table_version',async()=>{
  const r=await seedEntityKeys(ctx);
  const keys=await listEntityKeys(ctx);
  return {...r,entity_table_version:await entityTableVersion(ctx),in_scope:keys.filter(k=>k.in_scope).length,postgrest_log:pgrstLog.slice(0,300)};
 });
 await stage('Thesis (ACTIVE) for Palantir + public FILING source with the real 8-K text',async()=>{
  const keys=await listEntityKeys(ctx);const pltr=keys.find(k=>k.names_en[0].startsWith('Palantir'))!;
  const t=await createThesis(ctx,{title:'Palantir 商业化 AIP 拉动美国商业收入增速',body:'演练 thesis：观察 8-K/10-Q 中美国商业客户与 AIP 采用情况。',invalidation_conditions:['美国商业收入连续两季环比下滑','AIP 主要客户流失'],watch_metrics:['US commercial revenue growth','customer count'],next_review_at:new Date(Date.now()+7*86400000).toISOString(),company_ids:[pltr.entity_id]});
  const active=await transitionThesis(ctx,t.id,'ACTIVE','闭环演练：激活以进入 fan-out。');
  if(active.status!=='ACTIVE') throw new Error('thesis not ACTIVE: '+active.status);
  thesisId=t.id;
  const article=JSON.parse(readFileSync(join(outDir,'..','article.json'),'utf8'));
  const w=await ingestVersioned(ctx,{source_type:'FILING',title:article.title,url:article.url,raw_text:article.raw,trust_level:'HIGH',entity_ids:[pltr.entity_id],market:'US',permission:'public',origin_type:'filing',event_time:'2026-08-03T00:00:00.000Z',available_at:article.acceptance,metadata:{collector:'edgar',accession_number:article.accession,rehearsal:true}});
  return {thesis_id:t.id,status:active.status,filing_source:w};
 });
 await stage('A6 fan-out (rule backend; external models denied) → research_judgments',async()=>{
  const summary=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek:null,jev:null},escalate:null,sinceIso:'2026-01-01T00:00:00Z'});
  const visible=await listSources(ctx,{limit:50});
  const controlledCopyVisible=visible.some(s=>s.id===sourceIdFromPa);
  if(summary.theses===0||summary.judgments.written===0) throw new Error(`fan-out produced nothing: theses=${summary.theses} written=${summary.judgments.written}`);
  return {summary,sources_seen_by_fanout:summary.sources,pa_controlled_copy_visible_to_fanout:controlledCopyVisible,note:controlledCopyVisible?'':'S4 controlled copies are hidden from legacy pipelines by design (legacySourceVisible); the PA-derived text was judged through the public FILING row instead'};
 });
 await stage('A3 ledger: decision citing judgments + deterministic replay',async()=>{
  const replay=await replayJudgments(actor,thesisId,new Date().toISOString());
  const cited=replay.filter(j=>j.question_id==='Q1'&&!j.abstained).map(j=>j.id).slice(0,5);
  if(cited.length===0) throw new Error('no non-abstained Q1 judgments to cite');
  const d=await recordDecision(actor,{thesis_id:thesisId,week_of:new Date().toISOString().slice(0,10),arm:'collab',action:'shadow',reason:'演练：仅记录，不采纳。',cited_judgment_ids:cited,card_id:null,time_spent_minutes:1});
  const again=JSON.stringify(await replayJudgments(actor,thesisId,new Date(Date.now()+1000).toISOString()));
  return {judgments_replayed:replay.length,by_question:Object.fromEntries(['Q1','Q2','Q3','Q4'].map(q=>[q,replay.filter(j=>j.question_id===q).map(j=>j.selected??'abstain')])),ledger_decision_id:d.id,cited:cited.length,replay_byte_stable:again===JSON.stringify(replay)||'differs (as_of advanced)'};
 });
 await stage('§10.1 report over the rehearsal judgments',async()=>{
  const rows=await loadReportRows(actor);const m=summarize(rows);
  writeFileSync(join(outDir,'fanout-report.md'),renderMarkdown(m)+'\n');
  return {rows:rows.length,metrics:m.length};
 });
 await stage('S6: synthetic market freeze → evaluator commit → replay',async()=>{
  // The market snapshot must carry the observation's own security identity (freezeMarket digests them for equality).
  const security=(await admin.query("select payload->'securities'->0 s from research_s4_records where user_id=$1 and id=$2",[actor.userId,observationId])).rows[0].s;
  const mapping=syntheticMapping(security);
  const frozen=await freezeMarket(actor,observationId,mapping as any,'synthetic');
  const prep=await prepareEvaluation(actor,observationId);
  const input=await prepareInput(actor,observationId,prep.marketIds,prep.asOf);
  const commit=makeCommit(input,randomUUID(),prep.revision);
  const store=createS6Store(actor);
  const committed=await store.commitEvaluationResult(commit);
  const replay=replayObservation(commit.input as any,{ok:true,result:commit.result,result_sha256:commit.result_sha256} as any);
  return {frozen:typeof frozen==='object'?Object.keys(frozen as object):frozen,engine_version:commit.engine_version,rule_version:commit.rule_version,result_sha256:commit.result_sha256,committed:committed&&typeof committed==='object'?Object.keys(committed as object):committed,replay_matches:(replay as any).matches===true};
 });
 const out={ran_at:new Date().toISOString(),synthetic_binding:syntheticBinding,actor:actor.userId,alpha_commit:process.env.ALPHA_COMMIT??null,database:state.directory,stages};
 writeFileSync(join(outDir,'alpha-stage.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(stages.map(s=>`${s.status}: ${s.station}`),null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{postgrest?.kill();gateway?.close();await closeS4Pool();await admin.end();});
