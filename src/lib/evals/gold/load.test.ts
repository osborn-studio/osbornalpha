// src/lib/evals/gold/load.test.ts
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {GOLD_DIR,checkLock,detectGoldFormat,listGoldSetPaths,loadGoldSet,loadLock,loadRecorders,parseGoldBytes,parseLock,parseRecorders,repoPath} from './load';

const PLAN2='src/lib/facts/fixtures/gold/plan2.json';
const codeOf=(f:()=>unknown)=>{try{f();return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).code;}};

describe('repository fixtures',()=>{
 it('recorders.json: version 1, the owner only',()=>{
  expect(loadRecorders()).toEqual({version:1,recorders:[{id:'owner',role:'owner',modules:['facts','metrics','macro'],added_at:'2026-11-06',approved_by:'owner'}]});
 });
 it('lock.json pins plan2.json by its current byte hash',()=>{
  // toContainEqual, not toEqual: Task 9 appends the synthetic set's entry to the same lock file.
  expect(loadLock().files).toContainEqual({path:PLAN2,sha256:sha256Hex(readFileSync(PLAN2)),version:1,format:'legacy_plan2'});
 });
 it('loadGoldSet detects the legacy format by content, hashes the bytes and passes checkLock',()=>{
  const set=loadGoldSet(PLAN2);
  expect(set).toMatchObject({format:'legacy_plan2',path:PLAN2,sha256:sha256Hex(readFileSync(PLAN2)),ready:false});
  expect(()=>checkLock(set,loadLock())).not.toThrow();
  expect(loadGoldSet(join(process.cwd(),PLAN2)).path).toBe(PLAN2);
 });
 it('listGoldSetPaths finds the lock entry outside the gold directory',()=>{
  expect(listGoldSetPaths(process.cwd(),loadLock())).toContain(PLAN2);
  expect(listGoldSetPaths(process.cwd(),loadLock()).filter(p=>p.endsWith('lock.json')||p.endsWith('recorders.json'))).toEqual([]);
 });
});

describe('checkLock',()=>{
 const set=loadGoldSet(PLAN2);
 const entry={path:PLAN2,sha256:set.sha256,version:1,format:'legacy_plan2' as const};
 it('rejects a missing entry, a different hash, version or format',()=>{
  expect(codeOf(()=>checkLock(set,{files:[]}))).toBe('gold_lock_mismatch');
  expect(codeOf(()=>checkLock(set,{files:[{...entry,sha256:'0'.repeat(64)}]}))).toBe('gold_lock_mismatch');
  expect(codeOf(()=>checkLock(set,{files:[{...entry,version:2}]}))).toBe('gold_lock_mismatch');
  expect(codeOf(()=>checkLock(set,{files:[{...entry,format:'f6'}]}))).toBe('gold_lock_mismatch');
 });
});

describe('parseGoldBytes messages and strict shapes',()=>{
 it('names recorders_required and unknown_format',()=>{
  expect(()=>parseGoldBytes(new TextEncoder().encode('{"schema_version":1}'),'a.json',null)).toThrow(/recorders_required/);
  expect(()=>parseGoldBytes(new TextEncoder().encode('{"x":1}'),'a.json',null)).toThrow(/unknown_format/);
 });
 it('rejects unknown keys in recorder and lock entries',()=>{
  expect(codeOf(()=>parseRecorders({version:1,recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner',extra:1}]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseLock({files:[{path:'a',sha256:'0'.repeat(64),version:1,format:'f6',extra:1}]}))).toBe('gold_invalid');
 });
});

describe('format detection and file errors',()=>{
 it('decides by content',()=>{
  expect(detectGoldFormat({schema_version:1,cases:[]})).toBe('f6');
  expect(detectGoldFormat({entries:[],ready:false})).toBe('legacy_plan2');
  expect(detectGoldFormat({entries:[]})).toBeNull();
  expect(detectGoldFormat([])).toBeNull();
 });
 it('an f6 file in a temp repo is validated against that repo\'s recorders.json',()=>{
  const root=mkdtempSync(join(tmpdir(),'f6-load-'));
  mkdirSync(join(root,GOLD_DIR,'facts'),{recursive:true});
  writeFileSync(join(root,GOLD_DIR,'recorders.json'),JSON.stringify({version:1,recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]}));
  const set={schema_version:1,set_id:'facts/tmp',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code'],review_required:false,tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],
   cases:[{case_id:'X/cash/2023-12-31',subject:{market:'US',cik:'1'},target:{type:'fact',concept:'cash',period_start:null,period_end:'2023-12-31',duration:'INSTANT',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},expect:'missing',binding:'document',
    source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:'0000000001-24-000001'},url:'https://www.sec.gov/x',sha256:'c'.repeat(64)},provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06',reviewed_by:null,reviewed_at:null,retracted:null,notes:''}]};
  writeFileSync(join(root,GOLD_DIR,'facts','tmp.json'),JSON.stringify(set));
  expect(loadGoldSet(`${GOLD_DIR}/facts/tmp.json`,root)).toMatchObject({format:'f6',set_id:'facts/tmp',ready:true});
  expect(loadGoldSet(`${GOLD_DIR}/facts/tmp.json`,root).cases[0]).toMatchObject({as_of:null,required:true,expect:'missing'});
  expect(listGoldSetPaths(root)).toEqual([`${GOLD_DIR}/facts/tmp.json`]);
  writeFileSync(join(root,GOLD_DIR,'facts','tmp.json'),JSON.stringify({...set,cases:[{...set.cases[0],recorded_by:'claude-code'}]}));
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/tmp.json`,root))).toBe('gold_invalid');
  writeFileSync(join(root,GOLD_DIR,'facts','bad.json'),'{"schema_version":1,');
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/bad.json`,root))).toBe('gold_invalid');
  writeFileSync(join(root,GOLD_DIR,'facts','other.json'),'{"hello":1}');
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/other.json`,root))).toBe('gold_invalid');
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/absent.json`,root))).toBe('gold_invalid');
  // legacy format is accepted only at plan2.json's own path
  writeFileSync(join(root,GOLD_DIR,'facts','legacy.json'),'{"entries":[],"ready":true,"version":1,"required":{"US":true,"CN":false}}');
  expect(()=>loadGoldSet(`${GOLD_DIR}/facts/legacy.json`,root)).toThrow(/unknown_format/);
 });
 it('rejects paths outside the repository',()=>{
  expect(codeOf(()=>repoPath('../x.json',process.cwd()))).toBe('gold_invalid');
 });
 it('validates recorders.json and lock.json shapes',()=>{
  expect(codeOf(()=>parseRecorders({version:1,recorders:[{id:'owner',role:'owner',modules:['nope'],added_at:'2026-11-06',approved_by:'owner'}]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseRecorders({version:1,recorders:[{id:'synthetic',role:'x',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]}))).toBe('gold_invalid');
  const r={id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'};
  expect(codeOf(()=>parseRecorders({version:1,recorders:[r,r]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseLock({files:[{path:'a',sha256:'x',version:1,format:'f6'}]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseLock({files:[],extra:1}))).toBe('gold_invalid');
  const f={path:'a',sha256:'0'.repeat(64),version:1,format:'f6'};
  expect(codeOf(()=>parseLock({files:[f,f]}))).toBe('gold_invalid');
 });
});
