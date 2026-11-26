import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {checkExtractionRelease,publishExtraction} from './publish.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseline={extraction:'',chat:'现行聊天'};
const candidate={extraction:'由错例反思生成的试验文本',chat:baseline.chat};
const measure=(score)=>({score,passed:score===1,critical:false,rawCritical:false,latencyMs:30,error:null});
const businessAssessment=route=>({passed:true,failures:[],observed:{route}});

function fixture() {
  const scope={split:'holdout',repeat:2,uniqueCases:2,baselineHash:hash(baseline),candidateHash:hash(candidate),datasetHash:'1'.repeat(64)};
  const pairs=[1,2].flatMap(run=>['draft','chatter'].map(id=>({id,run})));
  return structuredClone({
    baseline,candidate,
    pool:{schema_version:1,candidates:[
      {index:0,parents:[null],candidate:baseline,validation_scores:{dev:0.7},validation_mean:0.7},
      {index:1,parents:[0],candidate,validation_scores:{dev:1},validation_mean:1},
    ]},
    report:{...scope,scope:'model-adapters',component:'extraction',rows:pairs.map(pair=>
      ({...pair,kind:'extraction',baseline:measure(pair.id==='draft'?0.5:1),candidate:measure(1)}))},
    business:{...scope,scope:'formal-proposal-validation-local-catalogue',pairedRuns:4,baselinePassed:4,candidatePassed:4,
      rows:pairs.map(pair=>{
        const route=pair.id==='draft'?'request_details':'no_proposal';
        return {...pair,expected:{route},baseline:businessAssessment(route),candidate:businessAssessment(route)};
      })},
  });
}

test('eligible extraction must come from a changed GEPA child with the checked live seed', () => {
  assert.equal(checkExtractionRelease(fixture()).gepaIndex,1);
  for (const change of [
    f=>{f.candidate={...f.baseline};}, f=>{f.candidate.chat='顺手改了聊天';},
    f=>{f.candidate.extraction='手写';}, f=>{f.pool.candidates[1].parents=[1];},
    f=>{f.pool.candidates[0].candidate.chat='另一起点';},
    f=>{delete f.pool.candidates[1].validation_scores;},
    f=>{f.pool.candidates[0].validation_scores={dev:1};}, f=>{f.pool.tie_break={paired_train_ids:['draft']};},
    f=>{f.pool.candidates.push({...f.pool.candidates[1],index:2,parents:[1]});},
  ]) {const f=fixture(); change(f); assert.throws(()=>checkExtractionRelease(f));}
});

test('requires complete repeated pairs and matching business/data identities', () => {
  for (const change of [
    f=>{f.report.repeat=1;}, f=>{f.report.component='both';},
    f=>{f.business.datasetHash='e'.repeat(64);}, f=>{f.report.candidateHash=hash(f.baseline);},
    f=>{f.report.rows[1]=f.report.rows[0];}, f=>{f.business.rows[2].id='other';},
    f=>{f.business.rows.splice(0,1);}, f=>{f.business.baselinePassed=0;},
    f=>{f.business.rows=f.business.rows.filter(r=>r.id==='draft'); Object.assign(f.business,{uniqueCases:1,pairedRuns:2,baselinePassed:2,candidatePassed:2});},
    f=>{delete f.report.rows[0].candidate.latencyMs;}, f=>{delete f.business.rows[0].candidate.failures;},
  ]) {const f=fixture(); change(f); assert.throws(()=>checkExtractionRelease(f));}
});

test('recomputes model gate and detects new unsafe routes even where baseline was already wrong', () => {
  const tied=fixture();
  tied.report.eligible=true;
  for (const row of tied.report.rows) row.candidate=row.baseline;
  assert.equal(checkExtractionRelease(tied).eligible,false);
  const risky=fixture();
  const first=risky.business.rows[0];
  first.baseline={passed:false,failures:['路由错'],observed:{route:'unavailable'}};
  first.candidate={passed:false,failures:['路由错'],observed:{route:'pm_simulation'}};
  risky.business.baselinePassed=risky.business.candidatePassed=3;
  const result=checkExtractionRelease(risky);
  assert.equal(result.eligible,false);
  assert.deepEqual(result.business.dangers,['draft']);
  const regression=fixture();
  regression.business.rows[0].candidate={passed:false,failures:['漏追问'],observed:{route:'no_proposal'}};
  regression.business.candidatePassed=3;
  assert.deepEqual(checkExtractionRelease(regression).business.regressions,['draft']);
});

test('dry run leaves file intact and eligible apply is serialized and refuses stale snapshots', t => {
  const dir=mkdtempSync(join(tmpdir(),'feishu-prompt-release-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const paths={activePath:join(dir,'active.json'),lockPath:join(dir,'lock.sqlite')};
  writeFileSync(paths.activePath,JSON.stringify(baseline));
  const f=fixture();
  assert.equal(publishExtraction(f,paths).applied,false);
  assert.deepEqual(JSON.parse(readFileSync(paths.activePath,'utf8')),baseline);
  const lock=new DatabaseSync(paths.lockPath);
  try {
    lock.exec('BEGIN EXCLUSIVE');
    assert.throws(()=>publishExtraction(f,{...paths,apply:true}),/发布进程持有锁/u);
    assert.deepEqual(JSON.parse(readFileSync(paths.activePath,'utf8')),baseline);
  } finally {lock.close();}
  f.report.rows[0].candidate.critical=true;
  assert.equal(publishExtraction(f,{...paths,apply:true}).applied,false);
  assert.deepEqual(JSON.parse(readFileSync(paths.activePath,'utf8')),baseline);
  f.report.rows[0].candidate.critical=false;
  assert.equal(publishExtraction(f,{...paths,apply:true}).applied,true);
  assert.deepEqual(JSON.parse(readFileSync(paths.activePath,'utf8')),candidate);
  assert.throws(()=>publishExtraction(f,{...paths,apply:true}),/现役提示词/u);
});
