import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {holdoutTextHash, runAutoCycle, usedHoldoutTexts} from './auto-cycle.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const save=(path,value)=>writeFile(path,JSON.stringify(value));
const baseline={extraction:'现行提取',chat:'现行聊天'};
const measure=score=>({score,passed:score===1,critical:false,rawCritical:false,error:null,latencyMs:20});

async function setup(t,component,variant={}) {
  const root=await mkdtemp(join(tmpdir(),'feishu-auto-cycle-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const runDirectory=join(root,'run');
  const options={activePath:join(root,'active.json'),lockPath:join(root,'lock.sqlite'),
    registryPath:join(root,'registry.sqlite'),liveQueuePath:join(root,'workflow.sqlite')};
  await save(options.activePath,baseline);
  const example=(id,split)=>({kind:component,id,group:'group-'+id,split,input:{text:'独立测试场景 '+id},expect:{}});
  const development=[example('train-one','train'),example('development-val','validation')];
  const holdout=['alpha','beta','gamma','delta'].map(id=>example(id,'holdout'));
  const businessFixtures={cases:holdout.map(r=>({id:r.id,sha256:hash(r),expected:{route:'no_proposal'}}))};
  const config={component,development,holdout,businessFixtures,runDirectory,model:'local-test',apply:true};
  const candidate={...baseline,[component]:'由 GEPA 反思的改写'};
  const stages=[];
  options.runStage=async (stage,{env})=>{
    assert.deepEqual(Object.keys(env).sort(),['PATH','LANG','FEISHU_LLM_MODEL','FEISHU_LLM_BASE_URL','FEISHU_LLM_TIMEOUT_MS','FEISHU_OPT_QUEUE_DB'].sort());
    assert.equal(env.FEISHU_OPT_QUEUE_DB,options.liveQueuePath);
    stages.push(stage.name);
    const arg=key=>stage.args[stage.args.indexOf('--'+key)+1];
    if (stage.name==='search') {
      assert.deepEqual(await read(arg('dataset')),development);
      assert.equal(stage.args.some(value=>value.endsWith('/holdout.json')),false);
      assert.equal((await read(join(runDirectory,'manifest.json'))).holdoutHash,hash(holdout));
      assert.ok(usedHoldoutTexts(options.registryPath).has(holdoutTextHash(holdout[0].input.text)));
      const pool=[baseline,...(variant.noChallenger?[]:[candidate])].map((value,index)=>({
        index,parents:[index===0?null:0],candidate:value,validation_mean:1,validation_scores:{'development-val':1},
      }));
      return save(arg('pool'),{schema_version:1,candidates:pool});
    }
    if (stage.name==='challenger') return save(arg('output'),candidate);
    const dataset=await read(arg('dataset'));
    const fresh=stage.name.startsWith('fresh');
    const pairs=[1,2].flatMap(run=>dataset.map(({id})=>({id,run})));
    const scope={split:'holdout',repeat:2,uniqueCases:dataset.length,
      datasetHash:hash(dataset),baselineHash:hash(baseline),candidateHash:hash(candidate)};
    if (stage.name.endsWith('-eval')) {
      const rows=pairs.map(row=>({...row,kind:component,baseline:measure(fresh?0.5:1),
        candidate:measure(variant.unimprovedTarget===row.id?0.5:1)}));
      if (variant.transientStage===stage.name) rows[0].candidate={...measure(0),transportError:true,error:'模型暂不可用'};
      if (variant.invalidStage===stage.name) rows[0].candidate={...measure(0),error:'模型输出无效'};
      return save(arg('report'),{...scope,scope:'model-adapters',component,rows});
    }
    const assessed={passed:true,failures:[],observed:{route:'no_proposal'}};
    const rows=pairs.map(row=>({...row,expected:{route:'no_proposal'},baseline:assessed,candidate:assessed}));
    if (!fresh && variant.unsafeHistorical) {
      rows[0].candidate={passed:false,failures:['越过澄清'],observed:{route:'pm_simulation'}};
    }
    return save(stage.args[4],{...scope,scope:'formal-proposal-validation-local-catalogue',
      pairedRuns:rows.length,baselinePassed:rows.length,candidatePassed:rows.filter(r=>r.candidate.passed).length,rows});
  };
  return {root,config,options,stages,candidate};
}

test('a genuine chat child activates after fresh gain and a separate historical regression comparison',async t=>{
  const f=await setup(t,'chat');
  const result=await runAutoCycle(f.config,f.options);
  assert.equal(result.status,'published');
  assert.deepEqual(await read(f.options.activePath),f.candidate);
  assert.equal((await read(join(f.config.runDirectory,'decision.json'))).applied,true);
  assert.deepEqual(f.stages,['search','challenger','fresh-eval','regression-eval']);
});

test('new unsafe formal routes in historical business replay block an improving extraction prompt',async t=>{
  const f=await setup(t,'extraction',{unsafeHistorical:true});
  const result=await runAutoCycle(f.config,f.options);
  assert.equal(result.status,'rejected');
  assert.ok(result.regression.business.dangers.length);
  assert.deepEqual(await read(f.options.activePath),baseline);
  assert.deepEqual(f.stages,['search','challenger','fresh-eval','fresh-business','regression-eval','regression-business']);
});

test('fresh score gain must include the reported defect and cannot be replaced by known regression results',async t=>{
  const f=await setup(t,'chat',{unimprovedTarget:'alpha'});
  f.config.targetIds=['alpha'];
  const result=await runAutoCycle(f.config,f.options);
  assert.equal(result.status,'rejected');
  assert.equal(result.decision.eligible,true);
  assert.deepEqual(f.stages,['search','challenger','fresh-eval']);
  assert.deepEqual(await read(f.options.activePath),baseline);
});

test('even a no-challenger experiment consumes its fresh sample and never substitutes a hand edit',async t=>{
  const f=await setup(t,'chat',{noChallenger:true});
  assert.equal((await runAutoCycle(f.config,f.options)).status,'no_challenger');
  const second={...f.config,runDirectory:join(f.root,'another')};
  second.holdout=structuredClone(f.config.holdout);
  for (const row of second.holdout) row.input.text=' '+row.input.text.toUpperCase()+'！';
  await assert.rejects(runAutoCycle(second,f.options),{code:'HOLDOUT_REUSED'});
  assert.deepEqual(f.stages,['search']);
  assert.deepEqual(await read(f.options.activePath),baseline);
});

test('overlap, reused known questions, and incomplete formal gold are rejected before any model call',async t=>{
  const f=await setup(t,'extraction');
  const copy=()=>structuredClone(f.config);
  const group=copy(); group.holdout[0].group=group.development[0].group;
  await assert.rejects(runAutoCycle(group,f.options),{code:'HOLDOUT_REUSED'});
  const text=copy(); text.holdout[0].input.text=text.development[1].input.text;
  await assert.rejects(runAutoCycle(text,f.options),{code:'HOLDOUT_REUSED'});
  const known=copy();
  const history=await read(new URL('./extraction-cases/acceptance.json',import.meta.url));
  known.holdout[0].input.text=history[0].input.text;
  await assert.rejects(runAutoCycle(known,f.options),{code:'HOLDOUT_REUSED'});
  const missing=copy(); missing.businessFixtures.cases.pop();
  await assert.rejects(runAutoCycle(missing,f.options),/业务预期/u);
  assert.deepEqual(f.stages,[]);
});


test('paired transport failures remain retryable in both gates; malformed model output stays a terminal rejection',async t=>{
  for(const transientStage of ['fresh-eval','regression-eval']){
    const f=await setup(t,'chat',{transientStage});
    await assert.rejects(runAutoCycle(f.config,f.options),{code:'MODEL_TRANSPORT'});
    assert.deepEqual(await read(f.options.activePath),baseline);
  }
  const f=await setup(t,'chat',{invalidStage:'fresh-eval'});
  assert.equal((await runAutoCycle(f.config,f.options)).status,'rejected');
  assert.deepEqual(await read(f.options.activePath),baseline);
});
