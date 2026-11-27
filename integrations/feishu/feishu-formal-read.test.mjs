import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createFormalReader,readFormalOverview} from './feishu-formal-read.mjs';

const owner='d81a3536-90e1-40a5-b0b2-461ceb994f69',analyst='d6f7d06f-cd1a-42e6-8e53-f01f821467a1';
const otherOwner='f7c0bc8c-8ae9-462c-9b38-9a4625374c10';
const id=n=>'d81a3536-90e1-40a5-b0b2-'+String(n).padStart(12,'0');
const secondAnalyst=id(21),boundAnalystIds=[analyst,secondAnalyst];
const profile={id:analyst,user_id:owner,display_name:'测试分析师',is_self:false};
function rec(n,hit=null,score=null,withdrawn=false){
  return {id:id(n),user_id:owner,analyst_id:analyst,profile,ticker:'XYZ',market:'US',action:'buy',reference_price:45,
    recommended_at:'2026-03-'+String(n).padStart(2,'0')+'T18:30:00+00:00',withdrawn_at:withdrawn?'2026-06-05T02:11:00Z':null,
    assessment:hit===null&&score===null?[]:[{user_id:owner,recommendation_id:id(n),hit,score,forward_5d_pct:'0',forward_20d_pct:'1.2',forward_60d_pct:null}]};
}
function mockDb(handler){
  return createClient('https://formal.test','synthetic-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async (input,opts)=>{
      assert.equal(opts.method,'GET');
      const url=new URL(input);
      if(url.pathname.endsWith('/analyst_profiles')){
        assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
        assert.equal(url.searchParams.get('id'),'eq.'+analyst);
        assert.equal(url.searchParams.get('is_self'),'eq.false');
        return response([profile]);
      }
      return handler(url,opts);
    }},
  });
}
const response=(rows,total=rows.length)=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+total:'*/'+total}});
test('score read pages through short hosted pages, excludes withdrawals and missing scores, and counts zero scores and misses',async()=>{
  let pages=0;
  const rows=[rec(4,false,'0'),rec(3),rec(2,true,8,true),rec(1,true,'2')];
  const db=mockDb(url=>{
    assert.match(url.pathname,/recommendations$/);assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    assert.equal(url.searchParams.get('profile.user_id'),'eq.'+owner);assert.equal(url.searchParams.get('assessment.user_id'),'eq.'+owner);
    assert.equal(url.searchParams.get('profile.is_self'),'eq.false');
    assert.equal(url.searchParams.get('analyst_id'),'in.('+analyst+')');
    assert.ok(![...url.searchParams.values()].some(value=>value==='*'));
    if(pages)assert.ok(url.searchParams.get('or').includes(rows[pages-1].id));
    const page=rows.slice(pages,pages+1);
    pages++;return response(page);
  });
  const reply=await readFormalOverview(db,{ownerId:owner,analystId:analyst,boundAnalystIds,sections:['scores','recommendations']});
  assert.equal(pages,5);
  for(const expected of ['正式分析建议（共 4 条）','有效建议 3 条','命中率 50.0%（1/2）','平均分 1.0（2 条有分数）','03/05 02:30','0.0 分｜未命中','5日 0.00% / 20日 1.20% / 60日 —','已撤回']){
    assert.ok(reply.includes(expected),expected);
  }
  assert.ok(!reply.includes('8.0 分'));
});
test('named and aggregate fill totals and lists are restricted to linked non-self bound analysts before the row limit',async()=>{
  for(const scope of [analyst,null]){
    const db=mockDb(url=>{
      assert.match(url.pathname,/trades$/);
      for(const path of ['user_id','decision.user_id','decision.rec.user_id','decision.rec.profile.user_id'])
        assert.equal(url.searchParams.get(path),'eq.'+owner);
      assert.equal(url.searchParams.get('decision.rec.analyst_id'),'in.('+(scope??boundAnalystIds.join(','))+')');
      assert.equal(url.searchParams.get('decision.rec.profile.is_self'),'eq.false');
      assert.match(url.searchParams.get('select'),/decision:decisions!inner\(user_id,rec:recommendations!inner/);
      const trade={id:id(1),user_id:owner,ticker:'XYZ',direction:'sell',quantity:3,price:14.35,fee:0,currency:'USD',
        executed_at:'2026-03-01T11:20:00Z',decision:{user_id:owner,rec:{...rec(1),action:'trim'}}};
      return response([trade],12);
    });
    const reply=await readFormalOverview(db,{ownerId:owner,analystId:scope,boundAnalystIds,sections:['trades']});
    assert.match(reply,/建议关联的模拟成交（共 12 条，列最近 1 条）/);
    assert.match(reply,/03\/01 19:20 测试分析师 XYZ 卖出 3 股 × 14.35 USD｜来源建议 减仓/);
  }
  const wrong={...rec(1),profile:{...profile,user_id:otherOwner}};
  await assert.rejects(readFormalOverview(mockDb(()=>response([wrong])),{ownerId:owner,analystId:analyst,boundAnalystIds,sections:['recommendations']}),/范围/);
});
test('aggregate analysis filters server-bound profiles before scoring and refuses out-of-scope rows on every read path',async()=>{
  const scope={ownerId:owner,analystId:null,boundAnalystIds,sections:['scores','recommendations']};
  const db=mockDb(url=>{
    assert.equal(url.searchParams.get('analyst_id'),'in.('+boundAnalystIds.join(',')+')');
    assert.equal(url.searchParams.get('profile.is_self'),'eq.false');
    return response([]);
  });
  const report=await readFormalOverview(db,scope);
  assert.match(report,/已绑定分析师/);
  assert.match(report,/有效建议 0 条/);

  for(const invalidProfile of [{...profile,is_self:true},{...profile,id:id(30)}]){
    const row={...rec(1),analyst_id:invalidProfile.id,profile:invalidProfile};
    await assert.rejects(readFormalOverview(mockDb(()=>response([row])),scope),/绑定不一致/);
    const trade={user_id:owner,decision:{user_id:owner,rec:row}};
    await assert.rejects(readFormalOverview(mockDb(()=>response([trade])),{...scope,sections:['trades']}),/绑定不一致/);
  }
  for(const invalidScope of [{boundAnalystIds:[]},{boundAnalystIds:undefined},{analystId:id(32)}]){
    await assert.rejects(readFormalOverview(null,{...scope,...invalidScope}),/查询范围无效/);
  }
});
test('GET client uses only the fixed formal origin, declines unknown scope, does not follow redirects and contains no Feishu credential',async()=>{
  const origin='https://formal.test',token='only-formal-token';
  const query=createFormalReader({FEISHU_SIMULATION_ORIGIN:origin,FEISHU_SIMULATION_INGEST_TOKEN:token,FEISHU_APP_SECRET:'fictitious'},
    {fetchImpl:async(url,opts)=>{
      assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/integrations/feishu/overview');
      assert.equal(url.searchParams.get('owner'),owner);assert.equal(url.searchParams.get('analyst'),'A');
      assert.equal(url.searchParams.get('sections'),'scores,trades');
      assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.headers.authorization,'Bearer '+token);
      assert.ok(!JSON.stringify(opts).includes('fictitious'));
      return Response.json({text:'测试结果'});
    }});
  assert.equal(await query({expectedOwnerId:owner,analystKey:'A',sections:['scores','trades']}),'测试结果');
  for(const q of [{analystKey:undefined},{sections:['cash']},{expectedOwnerId:'abc'}]){
    await assert.rejects(query({expectedOwnerId:owner,analystKey:'A',sections:['scores'],...q}));
  }
  const largeBook='持仓'.repeat(7000);
  const read=createFormalReader({FEISHU_SIMULATION_ORIGIN:origin,FEISHU_SIMULATION_INGEST_TOKEN:token},
    {fetchImpl:async()=>Response.json({text:largeBook})});
  assert.equal(await read({expectedOwnerId:owner,analystKey:'A',sections:['positions']}),largeBook);
  await assert.rejects(read({expectedOwnerId:owner,analystKey:'A',sections:['trades']}),/格式无效/);
});

test('positions replay every attributable fill in ledger order, including fees, partial sales, closures and separate currency denominators',async()=>{
  const otherProfile={...profile,id:secondAnalyst,display_name:'测试分析师乙'};
  function fill(n,ticker,direction,quantity,price,fee,currency,who=profile,day=n){
    return {id:id(n),user_id:owner,ticker,direction,quantity,price,fee,currency,
      executed_at:'2026-04-'+String(day).padStart(2,'0')+'T16:05:00Z',
      decision:{user_id:owner,rec:{...rec(1),analyst_id:who.id,profile:who}}};
  }
  // IDs 1 and 4 share their execution instant. The smaller sale UUID is later in the ingestion journal.
  const fills=[
    fill(1,'AAA','sell',4,30,2,'USD',profile,2),fill(2,'BBB','buy',4,25,0,'USD',profile,5),
    fill(3,'00300.HK','buy',100,10,0,'HKD'),fill(4,'AAA','buy',10,20,10,'USD',profile,2),
    fill(5,'AAA','buy',8,30,0,'USD',otherProfile),fill(6,'AAA','sell',1,60,0,'USD',otherProfile),
    fill(7,'CLOSED','buy',2,11,0,'USD'),fill(8,'CLOSED','sell',2,13,1,'USD'),
  ];
  const queries=[];
  const db=mockDb(url=>{
    queries.push(url);
    const qp=url.searchParams;
    if(url.pathname.endsWith('/trades')){
      assert.equal(qp.get('decision.rec.profile.is_self'),'eq.false');
      for(const key of ['user_id','decision.user_id','decision.rec.user_id','decision.rec.profile.user_id'])assert.equal(qp.get(key),'eq.'+owner);
      const scope=qp.get('decision.rec.analyst_id');
      const selected=fills.filter(row=>scope.includes(row.decision.rec.analyst_id)&&(!qp.has('id')||row.id>qp.get('id').slice(3)));
      assert.equal(qp.get('order'),'id.asc');
      return response(selected.slice(0,2),selected.length);
    }
    assert.match(url.pathname,/feishu_simulation_receipts$/);
    assert.equal(qp.get('owner_id'),'eq.'+owner);
    assert.ok(qp.get('trade_id').includes(id(1)));
    return response([{owner_id:owner,trade_id:id(1),event_order:'9007199254740994'},
      {owner_id:owner,trade_id:id(4),event_order:'9007199254740993'}]);
  });
  const scope={ownerId:owner,analystId:analyst,boundAnalystIds,sections:['positions']};
  const named=await readFormalOverview(db,scope);
  assert.match(named,/AAA｜净股数 6｜均价 21｜持仓成本 126 USD｜已实现盈亏 34 USD｜占比 55.75%/);
  assert.match(named,/BBB｜净股数 4｜均价 25｜持仓成本 100 USD｜已实现盈亏 0 USD｜占比 44.25%/);
  assert.match(named,/00300.HK｜净股数 100｜均价 10｜持仓成本 1000 HKD｜已实现盈亏 0 HKD｜占比 100%/);
  assert.match(named,/CLOSED｜净股数 0｜均价 0｜持仓成本 0 USD｜已实现盈亏 3 USD｜占比 0%/);
  assert.doesNotMatch(named,/待核|测试分析师乙/);
  assert.ok(queries.filter(url=>url.pathname.endsWith('/trades')).length>1);
  const combined=await readFormalOverview(db,{...scope,analystId:null});
  assert.match(combined,/AAA｜净股数 13｜均价 25.846153846154｜持仓成本 336 USD｜已实现盈亏 64 USD｜占比 77.06%/);
  assert.match(combined,/持仓成本 1000 HKD｜已实现盈亏 0 HKD｜占比 100%/);
});

test('a sell without a matching attributable opening lot preserves net shares without importing the account basis',async()=>{
  const row={id:id(1),user_id:owner,ticker:'XYZ',direction:'sell',quantity:3,price:24,fee:1,currency:'USD',
    executed_at:'2026-04-30T01:02:03Z',decision:{user_id:owner,rec:rec(1)}};
  const scope={ownerId:owner,analystId:analyst,boundAnalystIds,sections:['positions']};
  const out=await readFormalOverview(mockDb(()=>response([row])),scope);
  assert.match(out,/XYZ｜净股数 -3｜均价 待核｜持仓成本 待核 USD｜已实现盈亏 待核 USD｜占比 待核/);
  assert.match(out,/归属卖出超过/);
  const flat={...row,id:id(2),direction:'buy',executed_at:'2026-05-01T00:00:00Z'};
  const reopened={...flat,id:id(3),quantity:2,price:10,fee:1,executed_at:'2026-05-02T00:00:00Z'};
  const reopenedBook=await readFormalOverview(mockDb(()=>response([row,flat,reopened])),scope);
  assert.match(reopenedBook,/XYZ｜净股数 2｜均价 10.5｜持仓成本 21 USD｜已实现盈亏 待核 USD｜占比 100%/);
  const empty=await readFormalOverview(mockDb(()=>response([])),scope);
  assert.match(empty,/分析师 测试分析师[\s\S]*暂无归属持仓/);
  const classShares={...row,ticker:'BRK/B',currency:'USDT',direction:'buy'};
  const extended=await readFormalOverview(mockDb(()=>response([classShares])),scope);
  assert.match(extended,/BRK\/B｜净股数 3｜均价 24.333333333333｜持仓成本 73 USDT/);
  const other={...row,decision:{user_id:otherOwner,rec:rec(1)}};
  await assert.rejects(readFormalOverview(mockDb(()=>response([other])),scope),/范围/);
  await assert.rejects(readFormalOverview(mockDb(()=>response([row],2)),scope),/分页/);
  await assert.rejects(readFormalOverview(mockDb(url=>response(url.searchParams.has('id')?[]:[row],2)),scope),/读取期间/);
});
