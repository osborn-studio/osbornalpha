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
      assert.equal(opts.method,'GET');return handler(new URL(input),opts);
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
      const trade={id:id(1),user_id:owner,ticker:'XYZ',direction:'sell',quantity:3,price:14.35,currency:'USD',
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
  for(const q of [{analystKey:undefined},{sections:['positions']},{expectedOwnerId:'abc'}]){
    await assert.rejects(query({expectedOwnerId:owner,analystKey:'A',sections:['scores'],...q}));
  }
});
