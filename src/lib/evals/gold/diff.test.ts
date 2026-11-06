// src/lib/evals/gold/diff.test.ts
// goldDiff on in-memory trees, then the real git path in a throw-away repository (git init in
// os.tmpdir(), three commits: a multi-commit push is judged against event.before, not per commit).
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {changedGoldFiles,goldDiff,goldDiffAgainst,gitTreeAt,resolveCommit} from './diff';
import type {GoldTree} from './diff';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH} from './load';

type J=Record<string,any>;
const SET=`${GOLD_DIR}/facts/a.json`;
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v,null,1));
const kase=(id:string,value='100'):J=>({case_id:id,subject:{market:'US',cik:'1'},target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:value,unit_label:'',scale:'1'},canonical:{value},binding:'document',source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:'0000000001-24-000001'},url:'https://www.sec.gov/x',sha256:'c'.repeat(64),locator:{page:1}},
 provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06',reviewed_by:null,reviewed_at:null,retracted:null,notes:''});
const set=(over:J={}):J=>({schema_version:1,set_id:'facts/a',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code'],review_required:false,tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:[kase('A'),kase('B')],...over});
const recorders=(version:number,ids=['owner'])=>({version,recorders:ids.map(id=>({id,role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}))});
const tree=(entries:Record<string,unknown>):GoldTree=>new Map(Object.entries(entries).map(([k,v])=>[k,typeof v==='string'?new TextEncoder().encode(v):enc(v)]));
const codes=(r:{violations:{code:string}[]})=>r.violations.map(v=>v.code);

describe('goldDiff (in-memory trees)',()=>{
 it('identical trees and pure additions with a bump are clean',()=>{
  expect(goldDiff(tree({[SET]:set()}),tree({[SET]:set()}))).toEqual({violations:[],notices:[]});
  expect(goldDiff(tree({[SET]:set()}),tree({[SET]:set({version:2,cases:[kase('A'),kase('B'),kase('C')]})}))).toEqual({violations:[],notices:[]});
 });
 it('a case that disappears is a violation even with a bump',()=>{
  const r=goldDiff(tree({[SET]:set()}),tree({[SET]:set({version:2,cases:[kase('A')]})}));
  expect(r.violations).toEqual([{code:'case_removed',path:SET,case_id:'B'}]);
 });
 it('a renamed case (same content, new id) is reported as a rename',()=>{
  const r=goldDiff(tree({[SET]:set()}),tree({[SET]:set({version:2,cases:[kase('A'),kase('B2')]})}));
  expect(r.violations).toEqual([{code:'case_renamed',path:SET,case_id:'B',detail:'B2'}]);
 });
 it('a semantic case change without a version bump is a violation; with a bump it is clean',()=>{
  const changed=set({cases:[kase('A','101'),kase('B')]});
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:changed})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:{...changed,version:2}})))).toEqual([]);
 });
 it('set-level changes (thresholds, tolerance, optional_cases) need a bump; recorder-only edits do not',()=>{
  for(const over of [{thresholds:{max_fail:1,min_coverage_optional:'0.95'}},{tolerance:{rel:'0.01'}},{optional_cases:['B']},{artifact_class:'restricted'}])
   expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:set(over)}))),JSON.stringify(over)).toEqual(['version_not_bumped']);
  const reviewed=set({cases:[{...kase('A'),reviewed_by:'r2',reviewed_at:'2026-11-07'},kase('B')]});
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:reviewed})))).toEqual([]);
 });
 it('a retraction is a semantic change (needs a bump) and keeps the case',()=>{
  const retracted=set({cases:[{...kase('A'),retracted:{at:'2026-11-07',by:'owner',reason:'typo'}},kase('B')]});
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:retracted})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:{...retracted,version:2}})))).toEqual([]);
 });
 it('module_implementers changes need a bump and are listed as a notice',()=>{
  const r=goldDiff(tree({[SET]:set()}),tree({[SET]:set({module_implementers:['claude-code','codex']})}));
  expect(codes(r)).toEqual(['version_not_bumped']);
  expect(r.notices.map(n=>n.code)).toEqual(['module_implementers_changed']);
 });
 it('a whole set deleted, a version decrease and an unparsable head are violations',()=>{
  expect(codes(goldDiff(tree({[SET]:set()}),tree({})))).toEqual(['set_deleted']);
  expect(codes(goldDiff(tree({[SET]:set({version:3})}),tree({[SET]:set({version:2})})))).toEqual(['version_decreased']);
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:'{"schema_version":1,'})))).toEqual(['head_unparsable']);
 });
 it('a new set is a notice',()=>{
  expect(goldDiff(tree({}),tree({[SET]:set()}))).toEqual({violations:[],notices:[{code:'set_added',path:SET}]});
 });
 it('recorders.json: change is a notice, needs its own version bump, deletion is a violation; lock.json is ignored',()=>{
  const r=goldDiff(tree({[RECORDERS_PATH]:recorders(1)}),tree({[RECORDERS_PATH]:recorders(1,['owner','r2'])}));
  expect(codes(r)).toEqual(['recorders_version_not_bumped']);
  expect(r.notices.map(n=>n.code)).toEqual(['recorders_changed']);
  expect(goldDiff(tree({[RECORDERS_PATH]:recorders(1)}),tree({[RECORDERS_PATH]:recorders(2,['owner','r2'])}))).toEqual({violations:[],notices:[{code:'recorders_changed',path:RECORDERS_PATH}]});
  expect(codes(goldDiff(tree({[RECORDERS_PATH]:recorders(1)}),tree({})))).toEqual(['recorders_deleted']);
  expect(goldDiff(tree({[LOCK_PATH]:{files:[]}}),tree({}))).toEqual({violations:[],notices:[]});
 });
 it('legacy_plan2 files are diffed through the adapter (filling a pending value needs a bump)',()=>{
  const plan2=JSON.parse(readFileSync('src/lib/facts/fixtures/gold/plan2.json','utf8'));
  const P='src/lib/facts/fixtures/gold/plan2.json';
  const filled={...plan2,entries:plan2.entries.map((e:J,i:number)=>i===2?{...e,value:'150560330316.45'}:e)};
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:filled})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:{...filled,version:2}})))).toEqual([]);
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:{...plan2,ready:true}})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:{...plan2,version:2,entries:plan2.entries.slice(1)}})))).toEqual(['case_removed']);
 });
});

describe('gold diff over a real git repository',()=>{
 const root=mkdtempSync(join(tmpdir(),'f6-gold-diff-'));
 afterAll(()=>rmSync(root,{recursive:true,force:true}));
 const g=(...args:string[])=>execFileSync('git',['-c','user.name=f6-test','-c','user.email=f6-test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...args],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').trim();
 const write=(path:string,v:unknown)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),JSON.stringify(v,null,1));};
 g('init','-q','-b','main');
 write(RECORDERS_PATH,recorders(1));write(SET,set());write('README.md','x');
 g('add','-A');g('commit','-q','-m','c1');
 const c1=g('rev-parse','HEAD');
 write(SET,set({version:2,cases:[kase('A','101'),kase('B')]}));
 g('add','-A');g('commit','-q','-m','c2: value change with bump');
 const c2=g('rev-parse','HEAD');
 write(SET,set({version:2,cases:[kase('A','101'),kase('B')],thresholds:{max_fail:1,min_coverage_optional:'0.95'}}));
 write('README.md','y');
 g('add','-A');g('commit','-q','-m','c3: thresholds change without bump');
 it('resolves refs and lists only changed gold files',()=>{
  expect(resolveCommit('HEAD~2',root)).toBe(c1);
  expect(()=>resolveCommit('0'.repeat(40),root)).toThrow(EvalError);
  expect(changedGoldFiles(c1,[GOLD_DIR],root)).toEqual([SET]);
  expect(changedGoldFiles('HEAD',[GOLD_DIR],root)).toEqual([]);
  expect([...gitTreeAt(c1,[SET,`${GOLD_DIR}/absent.json`],root).keys()]).toEqual([SET]);
 });
 it('push of c2+c3 judged against event.before=c1: the bump in c2 covers the whole push',()=>{
  expect(goldDiffAgainst(c1,root)).toMatchObject({base:c1,changed:[SET],violations:[]});
 });
 it('push of c3 alone judged against event.before=c2: thresholds changed without a bump',()=>{
  expect(goldDiffAgainst(c2,root).violations).toEqual([{code:'version_not_bumped',path:SET,detail:'version 2'}]);
 });
 it('deleting the set in a further commit is a violation against any earlier base',()=>{
  g('rm','-q',SET);g('commit','-q','-m','c4: delete');
  expect(goldDiffAgainst(c1,root).violations).toEqual([{code:'set_deleted',path:SET}]);
 });
});
