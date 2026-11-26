import assert from 'node:assert/strict';
import test from 'node:test';
import {createGroupScopedReader} from './feishu-group-report.mjs';

const bindings=()=>({chatId:'group',simulationAccount:{confirmed:true,id:'owner'},
  analystBySender:{one:'analyst-1',two:'analystB',three:'demo',four:'analystB'},demoOnlyRoles:['demo'],
  analystNamesByRole:{'analyst-1':'analystA'},analystAliasesByRole:{'analyst-1':['示例分析师甲']}});
const request={expectedOwnerId:'owner',analystKey:null,analystKeys:['analystB','analyst-1'],sections:['trades']};
const report=count=>'正式模拟账户查询（指定分析师，北京时间）\n\n我的投资 · 建议关联的模拟成交（共 '+count+' 条）';

test('group uses only distinct named formal members and preserves per-person counts',async()=>{
  const calls=[];
  const query=createGroupScopedReader(async input=>{
    calls.push(input);
    if(!input.analystKey)return '全账户 私人成交';
    return report(input.analystKey==='analystB'?1:0);
  },bindings);
  const result=await query(request);
  assert.deepEqual(calls.map(input=>input.analystKey).sort(),request.analystKeys.toSorted());
  assert.ok(calls.every(input=>input.expectedOwnerId==='owner'&&input.sections===request.sections));
  assert.match(result,/示例分析师甲（analystA）\n分析师建议关联的模拟成交（共 0 条）/);
  assert.match(result,/analystB\n分析师建议关联的模拟成交（共 1 条）/);
  assert.doesNotMatch(result,/私人成交|analyst-1|demo|全账户/);
});

test('empty group, missing snapshot, foreign key, changed owner and changed group fail closed',async()=>{
  let current=bindings(),calls=0;
  const query=createGroupScopedReader(async()=>{calls++;return report(1);},()=>current);
  for(const bad of [{analystKeys:undefined},{analystKeys:['analystB']},{analystKey:'demo'},{analystKey:'external'},{expectedOwnerId:'other'}]){
    await assert.rejects(query({...request,...bad}));
  }
  current={...current,analystBySender:{}};
  assert.match(await query({...request,analystKeys:[]}),/尚未绑定/);
  assert.equal(calls,0);
  current=bindings();
  const changed=createGroupScopedReader(async()=>{current={...bindings(),chatId:'other'};return report(1);},()=>current);
  await assert.rejects(changed(request),/绑定已变更/);
});

test('named read passes through and group refuses partial, wider, or stale reports',async()=>{
  let current=bindings();
  const query=fn=>createGroupScopedReader(fn,()=>current);
  assert.equal(await query(async()=>report(2))({...request,analystKey:'analystB'}),report(2));
  await assert.rejects(query(async({analystKey})=>{
    if(analystKey==='analystB')throw Error('offline');
    return report(0);
  })(request),/offline/);
  await assert.rejects(query(async()=>report(1).replace('指定分析师','全账户'))(request),/范围/);
  await assert.rejects(query(async()=>{
    current={...current,analystBySender:{one:'analyst-1'}};
    return report(1);
  })(request),/变更/);
});

test('long reports retain member counts within the webhook budget',async()=>{
  const query=createGroupScopedReader(async()=>report(123)+'\n'+'详'.repeat(6000),bindings);
  const result=await query(request);
  assert.match(result,/按人汇总/);
  assert.equal(result.match(/共 123 条/g)?.length,2);
  assert.doesNotMatch(result,/详{5}/);
  assert.ok(Buffer.byteLength(result,'utf8')<=16000);
});
