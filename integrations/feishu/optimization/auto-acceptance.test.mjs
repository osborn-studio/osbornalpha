import assert from 'node:assert/strict';
import test from 'node:test';
import {acceptanceFamilies,freshAcceptance} from './auto-acceptance.mjs';
import {holdoutTextHash} from './auto-cycle.mjs';
import {frictionTaskFamilies} from './friction-label.mjs';
import {assessBusinessCase,loadBusinessFixtures} from './workflow-check.mjs';

function seeded(seed) {
  return range=>{
    seed=(seed*48271)%2147483647;
    return Math.floor(seed/2147483647*range);
  };
}

test('all independent topics generate immutable, group-disjoint holdout with a focus and separate control cases',()=>{
  const expected={chat:['casual','status','figures','procedure','reads'],extraction:['intent','security','execution','price_roles','read_intents']};
  assert.deepEqual(acceptanceFamilies,expected);
  const used=new Set();
  for(const [kind,families] of Object.entries(expected)) for(const family of families) {
    const now=Date.UTC(2026,1,12);
    // Restart the same pseudo-random stream each time to force the redraw path.
    const set=freshAcceptance(kind,family,{random:seeded(8165),now,used,hashText:holdoutTextHash});
    const ids=new Set(set.holdout.map(r=>r.id)), groups=new Set(set.holdout.map(r=>r.group));
    assert.equal(ids.size,6+2*(families.length-1)); assert.equal(groups.size,ids.size);
    assert.equal(set.targetIds.length,6);
    assert.equal(new Set(set.targetIds).size,6);
    assert.ok(set.targetIds.every(id=>ids.has(id)&&id.includes('-'+family+'-')));
    assert.ok(set.holdout.every(r=>r.kind===kind&&r.split==='holdout'));
    for(const row of set.holdout){
      const key=holdoutTextHash(row.input.text);
      assert.ok(!used.has(key)); used.add(key);
      if(kind==='chat' && row.expect.tool){
        assert.ok(['formal_report','pending','analyst_roster','group_report'].includes(row.expect.tool.read));
      }else if(kind==='chat'){
        assert.ok(row.expect.concepts.every(alternatives=>alternatives.length>0));
        for(const pattern of [...row.expect.concepts.flat(),...row.expect.criticalAvoid??[],...row.expect.avoid??[]]) {
          assert.doesNotThrow(()=>new RegExp(pattern,'iu'));
        }
      }else{
        assert.equal(row.input.receivedAt,new Date(now).toISOString());
      }
    }
    if(kind==='chat'){
      assert.equal(set.businessFixtures,undefined);
      continue;
    }
    const fixtures=loadBusinessFixtures(set.holdout,set.businessFixtures);
    for(const row of set.holdout){
      // Give the formal router the speaker's intended fields. This checks that
      // each independently authored downstream expectation is actually reachable.
      const fields=Object.fromEntries(Object.entries(row.expect.fields).map(([key,value])=>[
        key,{value,evidence:key==='quantity'?value+'股':row.input.text},
      ]));
      const assessment=assessBusinessCase(row,{intent:row.expect.intent,helpTopic:row.expect.helpTopic,fields,query:row.expect.query,
        intentEvidence:row.input.text},fixtures);
      assert.ok(assessment.passed,row.input.text+' '+assessment.failures.join(','));
    }
  }
  assert.equal(used.size,140);
});

test('each label targets only independently scored examples of its specific failure; all downstream business gold is executable',()=>{
  const tasks={
    ...Object.fromEntries(['read_analyst_roster','read_pending','read_recommendations','read_scores','read_trades','read_positions','read_group_report'].map(t=>[t,['chat','reads']])),
    ...Object.fromEntries(['analyst_roster','pending','recommendations','scores','trades','positions','group_report'].map(t=>['extract_read_'+t,['extraction','read_intents']])),
    investment_question:['extraction','intent'],quoted_view:['extraction','intent'],missed_owned:['extraction','intent'],
    stock_name:['extraction','security'],conditional_stop:['extraction','price_roles'],swapped_prices:['extraction','price_roles'],
    cash_budget:['extraction','execution'],share_count:['extraction','execution'],
    social:['chat','casual'],forgot_context:['chat','casual'],approval_method:['chat','procedure'],summary_price:['chat','figures'],
    summary_quantity:['chat','figures'],summary_status:['chat','status'],
  };
  assert.deepEqual(Object.keys(tasks).sort(),Object.keys(frictionTaskFamilies).sort());
  const targets=new Set();
  for(const [task,[kind,focus]] of Object.entries(tasks)){
    const suite=freshAcceptance(kind,focus,{task,random:seeded(2418),used:targets,hashText:holdoutTextHash});
    const probes=suite.holdout.filter(r=>suite.targetIds.includes(r.id));
    assert.equal(probes.length,6);
    assert.equal(suite.holdout.length-probes.length,2*acceptanceFamilies[kind].length);
    if(task==='forgot_context'){
      assert.equal(probes.filter(r=>r.expect.criticalAvoid).length,2);
      assert.equal(probes.filter(r=>r.expect.concepts[0].some(name=>r.input.history[0].content.includes(name))).length,4);
    }
    const fixtures=kind==='extraction'?loadBusinessFixtures(suite.holdout,suite.businessFixtures):null;
    for(const r of probes){
      const key=holdoutTextHash(r.input.text); assert.ok(!targets.has(key)); targets.add(key);
      assert.ok(r.id.includes('-'+task+'-'));
      const {input,expect}=r,fields=expect.fields;
      const gold=fixtures?.expectations.get(r.id);
      if(task.startsWith('read_'))assert.ok(expect.tool);
      switch(task){
        case 'investment_question':assert.equal(expect.helpTopic,'investment');assert.equal(gold.route,'no_proposal');break;
        case 'quoted_view':assert.equal(expect.intent,'other');assert.equal(gold.route,'no_proposal');break;
        case 'missed_owned':assert.equal(expect.intent,'proposal');assert.ok(fields.action);assert.equal(gold.route,'pm_advice');break;
        case 'stock_name':assert.ok(input.text.includes(fields.securityName));assert.match(input.text,/股票|个股|标的/);break;
        case 'conditional_stop':assert.ok(!('stop_loss' in fields));assert.equal(gold.route,'pm_advice');break;
        case 'swapped_prices':assert.notEqual(fields.price,fields.reference_price);assert.equal(gold.simulation.price,fields.price);assert.equal(gold.fields.reference_price,fields.reference_price);break;
        case 'cash_budget':assert.deepEqual(gold.missing,['quantity','price']);assert.ok(!fields.price&&!fields.quantity);break;
        case 'share_count':assert.deepEqual(input.pendingFields,['quantity']);assert.equal(gold.simulation.quantity,fields.quantity);break;
        case 'forgot_context':assert.ok(input.history.length);assert.ok(expect.concepts[0].length);break;
        case 'social':assert.ok(expect.maxChars);assert.ok(expect.avoid.length);break;
        case 'approval_method':assert.ok(input.isApprover);assert.ok(expect.concepts.some(c=>c.includes('同意')));break;
        case 'summary_price':assert.deepEqual(expect.numbers.required,[input.proposalContext.execution.price]);break;
        case 'summary_quantity':assert.deepEqual(expect.numbers.required,[input.proposalContext.execution.quantity]);break;
        case 'summary_status':assert.ok(input.proposalContext.status); assert.ok(expect.criticalAvoid.length);break;
      }
      if(!fixtures)continue;
      const packetFields=Object.fromEntries(Object.entries(fields).map(([name,value])=>[name,{value,
        evidence:name==='securityName'||name==='ticker'?value:name==='quantity'&&input.text.includes(value+'股')?value+'股':input.text}]));
      const result=assessBusinessCase(r,{intent:expect.intent,fields:packetFields,query:expect.query,helpTopic:expect.helpTopic,intentEvidence:input.text},fixtures);
      assert.ok(result.passed,task+': '+input.text+' '+result.failures.join(','));
    }
  }
  assert.equal(targets.size,6*Object.keys(tasks).length);
  assert.throws(()=>freshAcceptance('chat','figures',{task:'cash_budget'}),/错因/);
});
