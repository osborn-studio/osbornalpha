/** Run from the repo root with Node and Docker Desktop: node --import tsx scripts/ci/feishu-simulation-e2e.mjs */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as sdk from '@larksuiteoapi/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { loadAnalystReport } from '../../src/lib/analyst/report-store.ts';
import { POST } from '../../src/app/api/integrations/feishu/simulation/route.ts';
import { GET as getOverview } from '../../src/app/api/integrations/feishu/overview/route.ts';
import { makeFeishuConnector } from '../../integrations/feishu/feishu-connector.mjs';
import { createLocalFeishuWorkflow } from '../../demos/analyst-replay/feishu-local.mjs';
import { SCHEMA_BOOTSTRAP_SQL } from '../s4/local-db.ts';

const tag = 'alpha-feishu-e2e-' + randomBytes(8).toString('hex');
const network = tag + '-net';
const pg = tag + '-pg';
const gateway = tag + '-rest';
const cleanEnv = {PATH:process.env.PATH,NODE_ENV:'test'};
const pgPassword = randomBytes(24).toString('hex');
const rolePassword = randomBytes(24).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');
const bridgeToken = randomBytes(32).toString('hex');
const owner = randomUUID(), outsider = randomUUID(), analyst = randomUUID();
const chatId = 'oc_isolated_test', author = 'ou_isolated_analyst', approver = 'ou_isolated_pm';
const appId = 'cli_0123456789abcdef', botOpenId = 'ou_isolated_bot';
const suggestedAt = '2026-06-16T02:30:00.000Z', approvedAt = '2026-06-16T02:31:00.000Z';
const ingestPath = '/api/integrations/feishu/simulation';
const proposal = '我想加仓100股，模拟成交价400港元，手续费20港元，期限10日';
const supplement = '腾讯控股，参考价447.4，目标480，止损420';
const modelFields = new Map([
  [proposal,{
    action:{value:'add',evidence:'加仓'},quantity:{value:100,evidence:'100股'},
    price:{value:400,evidence:'模拟成交价400港元'},fee:{value:20,evidence:'手续费20港元'},
    horizon:{value:'10d',evidence:'期限10日'},
  }],
  [supplement,{
    securityName:{value:'腾讯控股',evidence:'腾讯控股'},
    reference_price:{value:447.4,evidence:'参考价447.4'},
    target_price:{value:480,evidence:'目标480'},stop_loss:{value:420,evidence:'止损420'},
  }],
]);

function docker(args, input) {
  return execFileSync('docker',['--context','desktop-linux',...args],{
    env: {PATH:process.env.PATH,HOME:process.env.HOME}, input, encoding:'utf8', timeout:30000, stdio:['pipe','pipe','pipe'],
  }).trim();
}

function sql(input) {
  return docker(['exec','-i',pg,'psql','-X','-q','-A','-t','-U','s4_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input);
}

async function ready(check, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check().catch(() => false)) return;
    await delay(100);
  }
  throw new Error(label + ' was not ready');
}

function roleJwt(role = 'service_role', sub) {
  const base64json = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = base64json({alg:'HS256',typ:'JWT'}) + '.' + base64json({role,sub,exp:Math.floor(Date.now()/1000)+600});
  return data + '.' + createHmac('sha256',jwtSecret).update(data).digest('base64url');
}

async function originOf(server) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

async function checkTradeOverview(formalOrigin) {
  const peer = randomUUID(), unbound = randomUUID(), self = randomUUID();
  sql(`with profiles as (
      insert into public.analyst_profiles(id,user_id,display_name,is_self) values
        ('${peer}','${owner}','同组分析师',false), ('${unbound}','${owner}','组外分析师',false), ('${self}','${owner}','账户本人',true)
      returning id,user_id
    ), calls as (
      insert into public.recommendations(user_id,analyst_id,ticker,market,action)
      select user_id,id,'01810.HK','HK','buy' from profiles returning id,user_id,ticker,market,action
    ), decisions as (
      insert into public.decisions(user_id,recommendation_id,ticker,market,action,status)
      select user_id,id,ticker,market,action,'executed' from calls returning id,user_id,ticker
    )
    insert into public.trades(user_id,decision_id,ticker,direction,quantity,price,currency)
      select user_id,id,ticker,'buy',20,30,'HKD' from decisions;`);
  // Including the self profile deliberately checks the read boundary even if a binding is misconfigured.
  process.env.FEISHU_SIMULATION_ANALYSTS = JSON.stringify({A:analyst,B:peer,self});
  for (const key of ['A',null]) {
    const url = new URL('/api/integrations/feishu/overview',formalOrigin);
    url.searchParams.set('owner',owner);
    url.searchParams.set('sections','trades,positions');
    if (key) url.searchParams.set('analyst',key);
    const response = await getOverview(new Request(url,{headers:{authorization:'Bearer '+bridgeToken}}));
    assert.equal(response.status,200);
    const {text} = await response.json();
    assert.match(text,/测试分析师 00700\.HK 买入 100 股 × 400 HKD/);
    assert.doesNotMatch(text,/账户本人|组外分析师/);
    assert.match(text,/分析师持仓（按成本，按币种分别计算）/);
    if (key) {
      assert.match(text,/正式模拟账户查询（分析师 测试分析师，北京时间）/);
      assert.match(text,/00700\.HK｜净股数 100｜均价 400.2｜持仓成本 40020 HKD｜已实现盈亏 0 HKD｜占比 100%/);
      assert.match(text,/模拟成交（共 1 条）/);
      assert.doesNotMatch(text,/同组分析师/);
    } else {
      assert.match(text,/模拟成交（共 2 条）/);
      assert.match(text,/同组分析师 01810\.HK 买入 20 股 × 30 HKD/);
      assert.match(text,/01810\.HK｜净股数 20｜均价 30｜持仓成本 600 HKD｜已实现盈亏 0 HKD｜占比 1.48%/);
      assert.match(text,/00700\.HK｜净股数 100｜均价 400.2｜持仓成本 40020 HKD｜已实现盈亏 0 HKD｜占比 98.52%/);
    }
  }
  // Exercise the dashboard with the same RLS policies as a signed-in user, including
  // an unfilled recommendation for the same ticker as a real fill.
  sql(`grant usage on schema auth to authenticated;
    grant select on public.analyst_profiles,public.recommendations,public.recommendation_scores,public.decisions,public.trades to authenticated;
    create or replace function auth.uid() returns uuid language sql stable as $body$
      select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $body$;
    insert into public.recommendation_scores(user_id,recommendation_id,score,hit,forward_5d_pct)
      select user_id,id,-1.5,false,-1.5 from public.recommendations where analyst_id='${peer}';
    insert into public.recommendations(user_id,analyst_id,ticker,market,action)
      values ('${owner}','${analyst}','00700.HK','HK','hold');`);
  const bound = [analyst,peer,self];
  const dashboard = user => loadAnalystReport(createClient(formalOrigin,roleJwt('authenticated',user),{
    auth:{persistSession:false,autoRefreshToken:false},
  }),owner,bound,AbortSignal.timeout(12000));
  const report = await dashboard(owner);
  assert.deepEqual(report.analysts.map(person=>person.id).sort(),[analyst,peer].sort());
  assert.equal(report.recommendations.length,3);
  assert.equal(report.trades.length,2);
  const pending = report.recommendations.find(row=>row.action==='hold');
  assert.equal(pending.score,null);
  assert.equal(pending.hit,null);
  assert.ok(report.trades.every(fill=>fill.recommendationId!==pending.id));
  const scored = report.recommendations.find(row=>row.analystId===peer);
  assert.equal(scored.score,-1.5);
  assert.equal(scored.hit,false);
  assert.equal(report.trades.find(fill=>fill.recommendationId===scored.id).quantity,20);
  const other = await dashboard(outsider);
  assert.deepEqual([other.analysts,other.recommendations,other.trades],[[],[],[]]);

  // A later receipt at the very same execution time must follow the opening lot,
  // even when its trade UUID sorts first. Exercise the actual PostgREST cast and journal join.
  sql(`with sale as (
      insert into public.recommendations(user_id,analyst_id,ticker,market,action)
      values ('${owner}','${analyst}','00700.HK','HK','trim') returning id
    ), decision as (
      insert into public.decisions(user_id,recommendation_id,ticker,market,action,status)
      select '${owner}',id,'00700.HK','HK','trim','executed' from sale returning id,recommendation_id
    ), fill as (
      insert into public.trades(id,user_id,decision_id,ticker,direction,quantity,price,fee,currency,executed_at)
      select '00000000-0000-4000-8000-000000000001','${owner}',decision.id,'00700.HK','sell',1,420,1,'HKD',opened.executed_at
      from decision cross join public.trades opened where opened.user_id='${owner}' and opened.ticker='00700.HK'
      returning id,decision_id
    )
    insert into public.feishu_simulation_receipts(owner_id,source_id,payload_hash,recommendation_id,decision_id,trade_id)
      select '${owner}','tie-order-fixture',repeat('c',64),decision.recommendation_id,decision.id,fill.id
      from decision join fill on fill.decision_id=decision.id;`);
  const namedUrl=new URL('/api/integrations/feishu/overview',formalOrigin);
  namedUrl.search=new URLSearchParams({owner,analyst:'A',sections:'positions'});
  const tie=await getOverview(new Request(namedUrl,{headers:{authorization:'Bearer '+bridgeToken}}));
  assert.equal(tie.status,200);
  assert.ok((await tie.json()).text.split('\n').includes(
    '00700.HK｜净股数 99｜均价 400.2｜持仓成本 39619.8 HKD｜已实现盈亏 18.8 HKD｜占比 100%'));
}

async function demoProcess(directory) {
  const fence = join(directory,'loopback-only.mjs');
  writeFileSync(fence,`const delegate=globalThis.fetch;
globalThis.fetch=(input,init)=>new URL(input instanceof Request?input.url:String(input)).hostname==='127.0.0.1'
  ?delegate(input,{...init,redirect:'error'}):Promise.reject(new Error('External fetch blocked in the isolated test'));\n`);
  const child = spawn(process.execPath,['--import','tsx','--import',fence,'demos/analyst-replay/server.mjs'],{
    env:{...cleanEnv,REPLAY_DATA_DIR:directory,REPLAY_PORT:'0'}, stdio:['ignore','pipe','pipe'],
  });
  let output = '';
  child.stdout.on('data',chunk => { output += chunk; });
  child.stderr.on('data',chunk => { output += chunk; });
  const stopped = once(child,'close');
  async function stop() { if (child.exitCode == null) child.kill('SIGTERM'); await stopped; }
  try {
    let origin;
    await ready(async () => Boolean(origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]),'Isolated Demo');
    return {origin,stop};
  } catch (error) {
    await stop();
    throw new Error('Isolated Demo startup failed: ' + output,{cause:error});
  }
}

function openConnector(messages, extractWithModel) {
  let dispatch;
  let workflow;
  class MockSocket {
    async start({eventDispatcher}) { dispatch = data => eventDispatcher.invoke(data,{needCheck:false}); }
    close() {}
  }
  class MockClient {
    async request(options) {
      assert.equal(options.url,'/open-apis/bot/v3/info');
      return {code:0,bot:{open_id:botOpenId}};
    }
    record(data, destination) {
      const id = 'om_local_reply_' + (messages.length + 1);
      messages.push({id,...destination,text:JSON.parse(data.content).text,uuid:data.uuid});
      return {code:0,data:{message_id:id}};
    }
    im = {message:{
      reply:async ({path,data}) => this.record(data,{replyTo:path.message_id}),
      create:async ({params,data}) => {
        assert.equal(params.receive_id_type,'chat_id');
        assert.equal(data.receive_id,chatId);
        return this.record(data,{chatId:data.receive_id});
      },
    }};
  }
  const connector = makeFeishuConnector({appId,appSecret:'synthetic-only-secret', intervalMs:60000, log:() => {},
    createWorkflow:options => (workflow = createLocalFeishuWorkflow({...options,extractWithModel})),
    sdk:{...sdk,WSClient:MockSocket,Client:MockClient},
  });
  return {start:() => connector.start(), stop:() => connector.stop(), view:() => workflow.view(), async send(messageId,text,sender,at,parentId) {
    const mention = sender === author && !parentId;
    const mentions = mention ? [{key:'@_user_1',id:{open_id:botOpenId}}] : [];
    await dispatch({schema:'2.0',header:{event_type:'im.message.receive_v1',event_id:'ev_' + messageId,app_id:appId},event:{
      sender:{sender_type:'user',sender_id:{open_id:sender}},
      message:{message_id:messageId,chat_id:chatId,chat_type:'group',message_type:'text',
        create_time:String(Date.parse(at)),parent_id:parentId,mentions,
        content:JSON.stringify({text:mention ? '@_user_1 '+text : text})},
    }});
    await workflow.drain();
  },drain:() => workflow.drain()};
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(),'alpha-feishu-e2e-'));
  const containers = [];
  let networkCreated = false;
  let bridge, demo, connector;
  const snapshots = [];
  try {
    docker(['network','create','--label','osborn.scope=feishu-e2e',network]);
    networkCreated = true;
    docker(['run','--pull=never','-d','--name',pg,'--label','osborn.scope=feishu-e2e','--network',network,'--network-alias','pg',
      '-e','POSTGRES_USER=s4_admin','-e','POSTGRES_PASSWORD='+pgPassword,'postgres:17-alpine']);
    containers.push(pg);
    await ready(async () => Boolean(docker(['exec',pg,'pg_isready','-h','127.0.0.1','-U','s4_admin','-d','postgres'])),'Isolated PostgreSQL');
    sql(`create role postgres nologin superuser;
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create role test_api login noinherit password '${rolePassword}';
      grant anon, authenticated, service_role to test_api;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges for role s4_admin in schema public grant all on tables to service_role;
      ${SCHEMA_BOOTSTRAP_SQL}`);
    const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
    for (const file of migrations) {
      try { sql(readFileSync(join('supabase/migrations',file),'utf8')); }
      catch (cause) { throw new Error('Migration failed: '+file,{cause}); }
    }
    sql(`insert into auth.users(id,email) values ('${owner}','owner@synthetic.invalid'),('${outsider}','other@synthetic.invalid');
      insert into public.analyst_profiles(id,user_id,display_name,kind) values ('${analyst}','${owner}','测试分析师','human');`);
    docker(['run','--pull=never','-d','--name',gateway,'--label','osborn.scope=feishu-e2e','--network',network,
      '-p','127.0.0.1::3000','-e','PGRST_DB_URI=postgres://test_api:'+rolePassword+'@pg:5432/postgres',
      '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET='+jwtSecret,
      'public.ecr.aws/supabase/postgrest:v16.2']);
    containers.push(gateway);
    const address = docker(['port',gateway,'3000/tcp']);
    assert.match(address,/^127\.0\.0\.1:\d+$/);
    const restOrigin = 'http://' + address;
    await ready(async () => (await fetch(restOrigin,{signal:AbortSignal.timeout(500),redirect:'error'})).ok,'Isolated PostgREST');
    let loseReceipt = true, routeError;
    bridge = createServer(async (request,response) => {
      try {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const headers = new Headers(request.headers);
        headers.delete('host');
        const {method,url} = request;
        let returned;
        if (url === ingestPath && method === 'POST') {
          returned = await POST(new Request(formalOrigin + url,{method,headers,body}));
          const receipt = await returned.json();
          snapshots.push({status:returned.status,receipt,payload:JSON.parse(body.toString())});
          // The database committed. Simulate a response loss at the caller boundary.
          const dropped = returned.status === 201 && loseReceipt;
          if (dropped) loseReceipt = false;
          returned = Response.json(dropped ? {error:'synthetic_lost_receipt'} : receipt,{status:dropped ? 503 : returned.status});
        } else if (url?.startsWith('/rest/v1/')) {
          returned = await fetch(restOrigin + url.slice('/rest/v1'.length),{method,headers,body,redirect:'error',signal:AbortSignal.timeout(10000)});
        } else returned = new Response(null,{status:404});
        const contentRange = returned.headers.get('content-range');
        response.writeHead(returned.status,{'content-type':returned.headers.get('content-type') || 'application/json',
          ...(contentRange && {'content-range':contentRange})});
        response.end(Buffer.from(await returned.arrayBuffer()));
      } catch (error) { routeError = error; response.writeHead(500).end(); }
    });
    const formalOrigin = await originOf(bridge);
    // Only generated loopback endpoints and credentials are visible to the production functions.
    Object.assign(process.env,{
      NEXT_PUBLIC_SUPABASE_URL:formalOrigin,SUPABASE_SERVICE_ROLE_KEY:roleJwt(),
      FEISHU_SIMULATION_INGEST_ENABLED:'true',FEISHU_SIMULATION_INGEST_TOKEN:bridgeToken,
      FEISHU_SIMULATION_OWNER_ID:owner,FEISHU_SIMULATION_ANALYSTS:JSON.stringify({A:analyst}),
      FEISHU_SIMULATION_ORIGIN:formalOrigin,REPLAY_DATA_DIR:directory,
    });
    demo = await demoProcess(directory);
    // The ephemeral Demo has all its files inside `directory`; the formal PostgreSQL is a distinct container.
    process.env.REPLAY_PORT = new URL(demo.origin).port;
    writeFileSync(join(directory,'feishu-bindings.json'),JSON.stringify({chatId,
      analystBySender:{[author]:'A',ou_other_analyst:'B'},analystNamesByRole:{A:'测试分析师'},approverIds:[approver],
      simulationAccount:{id:owner,confirmed:true},
    }),{mode:0o600});
    const messages = [];
    const extractionCalls = [];
    const fixtureModel = async request => {
      extractionCalls.push(request);
      const fields = modelFields.get(request.text);
      assert.ok(fields,'Unexpected input for the isolated model fixture');
      return {intent:'proposal',fields};
    };
    connector = openConnector(messages,fixtureModel);
    await connector.start();
    const keys = JSON.parse(readFileSync(join(directory,'role-keys.json'),'utf8'));
    async function postDemo(path, role, body) {
      const response = await fetch(demo.origin + path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(40000),
        headers:{origin:demo.origin,authorization:'Bearer '+keys[role],'content-type':'application/json'},
        body:JSON.stringify(body)});
      assert.ok(response.ok,path + ' returned HTTP ' + response.status);
      return response.json();
    }
    await postDemo('/api/webhook','PM',{mode:'app'});
    await connector.send('om_proposal',proposal,author,suggestedAt);
    assert.equal(snapshots.length,0);
    assert.equal(sql('select count(*) from public.recommendations;'),'0');
    const prompt = messages.find(item => item.replyTo === 'om_proposal');
    assert.ok(prompt?.text.includes('标的'));
    assert.doesNotMatch(prompt.text,/参考价|目标价|止损|理由|关联研究/);
    await connector.send('om_premature','同意',approver,suggestedAt,prompt.id);
    assert.equal(connector.view().proposals.length,0);
    await connector.send('om_fill',supplement,author,suggestedAt,prompt.id);
    assert.deepEqual(extractionCalls.map(({text,isSupplement}) => [text,isSupplement]),[[proposal,false],[supplement,true]]);
    assert.equal(extractionCalls[1].priorFields.quantity,100);
    const summary = connector.view().proposals[0].summaryId;
    assert.ok(summary);
    await connector.send('om_wrong_approval','同意',author,approvedAt,summary);
    assert.equal(snapshots.length,0);
    await connector.send('om_approve','同意',approver,approvedAt,summary);
    assert.ifError(routeError);
    assert.equal(connector.view().proposals[0].formalStatus,'pending_formal_sync');
    assert.equal(snapshots[0]?.status,201);
    assert.equal(sql('select count(*) from public.trades;'),'1');
    assert.equal(await connector.stop(),0);
    connector = openConnector(messages,fixtureModel);
    await connector.start();
    await delay(2200);
    await connector.drain();
    assert.ifError(routeError);
    const recorded = connector.view().proposals[0];
    assert.equal(recorded.demoStatus,'registered');
    assert.equal(recorded.formalStatus,'registered');
    assert.equal(recorded.simulationStatus,'registered');
    assert.equal(snapshots[1].status,200);
    assert.equal(snapshots[1].receipt.replayed,true);
    assert.deepEqual(snapshots[1].payload,snapshots[0].payload);
    assert.equal(snapshots[1].receipt.tradeId,snapshots[0].receipt.tradeId);
    assert.equal(recorded.formalId,snapshots[0].receipt.recommendationId);
    assert.equal(recorded.decisionId,snapshots[0].receipt.decisionId);
    assert.equal(recorded.tradeId,snapshots[0].receipt.tradeId);
    await connector.send('om_approve','同意',approver,approvedAt,summary);
    await connector.send('om_second_approval','同意',approver,approvedAt,summary);
    assert.equal(extractionCalls.length,2);
    assert.equal(snapshots.length,2);

    const state = await (await fetch(demo.origin + '/api/state',{headers:{authorization:'Bearer '+keys.A}})).json();
    assert.equal(state.registrations.entries.length,1);
    assert.equal(state.registrations.entries[0].id,recorded.demoId);
    assert.notEqual(recorded.demoId,recorded.formalId);
    assert.equal(state.registrations.entries[0].status,'final');
    const rec = state.registrations.entries[0].recommendation;
    assert.equal(rec.reference_price,447.4);
    assert.equal(rec.target_price,480);
    assert.equal(rec.stop_loss,420);
    assert.equal(rec.rationale,null);
    assert.equal(state.registrations.entries[0].evidence.mode,'snapshot');
    assert.deepEqual(state.portfolio.trades,[]);
    assert.ok(messages.some(row => /5 日.*评分/.test(row.text) && /10 日.*评分/.test(row.text) && /累计命中率/.test(row.text)));
    assert.ok(messages.some(row => row.replyTo && row.text.includes('按已完成的实际交易周期计分')));
    assert.equal(messages.filter(row => row.chatId).length,0,'one group-originated score should only have a thread reply');
    const {entry:peer} = await postDemo('/api/registrations','B',{ticker:'00700.HK',market:'HK',action:'buy',
      rationale:'页面历史建议',recommended_at:suggestedAt,requestId:randomUUID()});
    const first = state.registrations.entries[0];
    assert.equal(peer.pairNo,first.pairNo);
    await postDemo('/api/registrations/review','PM',{pairNo:first.pairNo,decision:'accept',note:'已核对交易日与价格',
      evidenceIds:[first.evidence.snapshotId,peer.evidence.snapshotId]});
    await ready(async () => {
      await connector.drain();
      return messages.filter(row => row.chatId).length >= 2;
    },'Application group broadcasts');
    const broadcast = messages.filter(row => row.chatId);
    assert.equal(broadcast.length,2);
    assert.match(broadcast[0].text,/评分/);
    assert.match(broadcast[1].text,/验收通过/);
    const row = JSON.parse(sql(`select json_build_object('owner',r.user_id,'analyst',r.analyst_id,'recommendation',r.id,'ticker',r.ticker,
      'decision',d.id,'trade',t.id,'trade_owner',t.user_id,'direction',t.direction,'currency',t.currency,'fee',t.fee,
      'holding',p.shares,'cost',round(p.avg_cost,2),'horizon',r.source_ref->>'requested_horizon',
      'reference',r.reference_price,'target',r.target_price,'stop',r.stop_loss,'rationale',r.rationale)
      from public.recommendations r join public.decisions d on d.recommendation_id=r.id
      join public.trades t on t.decision_id=d.id join public.positions p on p.user_id=t.user_id and p.ticker=t.ticker;`));
    assert.deepEqual(row,{owner,analyst,recommendation:recorded.formalId,ticker:'00700.HK',decision:recorded.decisionId,
      trade:recorded.tradeId,trade_owner:owner,direction:'buy',currency:'HKD',fee:20,holding:100,cost:400.2,horizon:'10d',
      reference:447.4,target:480,stop:420,rationale:null});
    const badOwner = await fetch(formalOrigin + ingestPath,{method:'POST',headers:{authorization:'Bearer '+bridgeToken,'content-type':'application/json'},
      body:JSON.stringify({...snapshots[0].payload,expectedOwnerId:outsider})});
    assert.equal(badOwner.status,403);
    assert.equal(sql(`select count(*) from public.positions where user_id='${outsider}';`),'0');
    await checkTradeOverview(formalOrigin);
    console.log(JSON.stringify({scope:'isolated formal PostgreSQL/PostgREST and Demo SQLite; mocked Feishu transport and model',
      migrations:migrations.length,demoScoring:'T+5/T+10 fixture',appBroadcasts:'group score and PM acceptance',
      formalWrites:1,retry:'same receipt',holding:'100 HKD shares at 400.20 average cost',wrongOwner:'rejected',
      formalTradeReads:'1 named, 2 bound, self and unbound excluded',
      formalPositionReads:'named 100%, bound group 98.52% and 1.48% by HKD cost',
      analystDashboard:'3 recommendations, 2 linked fills; signed-in RLS isolates the owner'}));
  } finally {
    const cleanup = [];
    try { await connector?.stop(); } catch (error) { cleanup.push(error); }
    try { await demo?.stop(); } catch (error) { cleanup.push(error); }
    try { if (bridge?.listening) await new Promise((resolve,reject) => bridge.close(error => error ? reject(error) : resolve())); }
    catch (error) { cleanup.push(error); }
    for (const name of containers.reverse()) {
      try { docker(['rm','-f','-v',name]); } catch (error) { cleanup.push(error); }
    }
    if (networkCreated) {
      try { docker(['network','rm',network]); } catch (error) { cleanup.push(error); }
    }
    rmSync(directory,{recursive:true,force:true});
    if (cleanup.length) throw new AggregateError(cleanup,'Owned fixture cleanup failed for '+tag);
  }
}

main().catch(error => {
  const redact = text => [pgPassword,rolePassword,jwtSecret,bridgeToken].reduce((out,secret) => out.replaceAll(secret,'[synthetic secret]'),text);
  console.error(redact([error.stack,error.cause?.stderr,error.cause?.message].filter(Boolean).join('\n')));
  process.exitCode = 1;
});
