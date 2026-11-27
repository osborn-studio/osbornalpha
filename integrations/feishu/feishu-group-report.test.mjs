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
  assert.match(result,/示例分析师甲（analystA）\n示例分析师甲（analystA） · 建议关联的模拟成交（共 0 条）/);
  assert.match(result,/analystB\nanalystB · 建议关联的模拟成交（共 1 条）/);
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

test('named read labels a legacy report and group refuses partial, wider, or stale reports',async()=>{
  let current=bindings();
  const query=fn=>createGroupScopedReader(fn,()=>current);
  assert.equal(await query(async()=>report(2))({...request,analystKey:'analystB'}),
    '正式模拟账户查询（分析师 analystB，北京时间）\n\nanalystB · 建议关联的模拟成交（共 2 条）');
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

const positionHeader='分析师持仓（按成本，按币种分别计算）';
const position=(ticker,cost,currency,weight)=>ticker+'｜净股数 1｜均价 '+cost+'｜持仓成本 '+cost+' '+currency+'｜已实现盈亏 0 '+currency+'｜占比 '+weight;
const namedPositions=(name,rows)=>'正式模拟账户查询（分析师 '+name+'，北京时间）\n\n'+positionHeader+'\n'+rows.join('\n');

test('per-person rows keep the analyst weight while group costs combine the same ticker only within its currency',async()=>{
  const calls=[];
  const query=createGroupScopedReader(async ({analystKey})=>{
    calls.push(analystKey);
    return analystKey==='analyst-1'?namedPositions('analystA',[
      position('01800.HK',20,'HKD','20%'),position('00700.HK',80,'HKD','80%'),position('NVDA',1200,'USD','100%'),
    ]):namedPositions('analystB',[position('01800.HK',100,'HKD','100%')]);
  },bindings);
  const result=await query({...request,sections:['positions']});
  assert.deepEqual(calls.sort(),request.analystKeys.toSorted());
  assert.match(result,/示例分析师甲（analystA）\n分析师持仓（按成本，按币种分别计算）\n01800\.HK[^\n]+占比 20%/u);
  assert.match(result,/analystB\n分析师持仓[^\n]+\n01800\.HK[^\n]+占比 100%/u);
  const totals=result.split('全组持仓与占比（按同币种持仓成本）\n')[1];
  assert.match(totals,/00700\.HK｜净股数 1｜均价 80｜持仓成本 80 HKD｜已实现盈亏 0 HKD｜占比 40%/u);
  assert.match(totals,/01800\.HK｜净股数 2｜均价 60｜持仓成本 120 HKD｜已实现盈亏 0 HKD｜占比 60%/u);
  assert.match(totals,/NVDA[^\n]+USD｜占比 100%/u);
});

test('unattributable costs suppress only that currency group and retain the explanation and analyst labels',async()=>{
  const note='归属卖出超过该分析师当时可归属的买入，成本或盈亏缺少依据，标为待核。';
  const query=createGroupScopedReader(async ({analystKey})=>analystKey==='analyst-1'?
    namedPositions('analystA',[position('NVDA','待核','USD','待核'),note]):
    namedPositions('analystB',[position('AAPL',1,'USD','100%'),position('00700.HK',50,'HKD','100%')]),bindings);
  const result=await query({...request,sections:['positions']});
  const totals=result.split('全组持仓与占比（按同币种持仓成本）\n')[1];
  assert.ok(totals.includes(note));
  assert.match(totals,/NVDA[^\n]+USD｜占比 待核/u);assert.match(totals,/AAPL[^\n]+USD｜占比 待核/u);
  assert.match(totals,/00700.HK[^\n]+HKD｜占比 100%/u);
  for(const invalid of [namedPositions('陌生人',['暂无归属持仓。']),namedPositions('analystA',['意外的账户信息'])]){
    const bad=createGroupScopedReader(async()=>invalid,bindings);
    await assert.rejects(bad({...request,sections:['positions']}));
    await assert.rejects(bad({...request,analystKey:'analystB',sections:['positions']}));
  }
});

test('oversize named query returns an explicitly partial list, retaining percentages based on the complete book',async()=>{
  const rows=Array.from({length:250},(_,i)=>position('SYM'+i,1,'USD','0.4%'));
  const query=createGroupScopedReader(async()=>namedPositions('analystB',rows),bindings);
  const result=await query({...request,analystKey:'analystB',sections:['positions']});
  assert.match(result,/共 250 个标的，占比基于全部持仓/u);
  assert.match(result,/SYM0[^\n]+占比 0\.4%/u);assert.doesNotMatch(result,/SYM249｜/u);
  assert.ok(Buffer.byteLength(result,'utf8')<=16000);
});

test('formal transaction symbols with spaces/slashes and multi-character currencies survive group rendering',async()=>{
  const rows=[position('BRK/B',100,'USD','50%'),position('BRK B',100,'USD','50%'),position('ETH',30,'USDT','100%')];
  const query=createGroupScopedReader(async({analystKey})=>analystKey==='analystB'?
    namedPositions('analystB',rows):namedPositions('analystA',['暂无归属持仓。']),bindings);
  const totals=(await query({...request,sections:['positions']})).split('全组持仓与占比（按同币种持仓成本）\n')[1];
  assert.match(totals,/BRK\/B[^\n]+USD｜占比 50%/u);assert.match(totals,/BRK B[^\n]+USD｜占比 50%/u);
  assert.match(totals,/ETH[^\n]+USDT｜占比 100%/u);
});
