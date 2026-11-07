// src/lib/evals/validate/manifest.test.ts
// Spec §10 per-evidence-kind authentication and common rules (and Codex plan round 1 P1-2/P1-3/P1-4/P2-2/P2-3), on
// in-memory committed files per commit, a stub service-role getRun, stub dq_freshness rows and a stub GitHub run.
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {CANARY_SERIES,CANARY_VALUE,REFERENCE_THRESHOLDS,evaluateReference,referenceSummary} from '../kinds/reference';
import type {ReferenceSample} from '../kinds/reference';
import {summarize,statusOfGate} from '../summary';
import type {CaseReport,EvalKind,EvalReport,EvalRunRow,EvidenceClass,GoldCase,GoldLock,GoldSet} from '../types';
import {seededSelection} from './expert';
import {runValidate} from './cli';
import {privilegedFactsReader} from '../adapters/facts';
import {companyFactsDoc,memoryWorld} from '../adapters/memory-world';
import {memoryRawStorage} from '../adapters/provenance';
import {LANDED_PARSERS} from '../cli/deps';
import {FORMULA_VERSION} from '../../facts/derive';
import {gcase,gset} from '../kinds/official-test-support';
import {runGoldSet} from '../run-gold-set';
import {manifestHandler} from './handlers';
import {validateManifest} from './manifest';
import type {FreshnessRow,ManifestDeps} from './manifest';

const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const RELEASE='e'.repeat(40);
const ID={official:'aaaaaaaa-0000-4000-8000-000000000001',live:'aaaaaaaa-0000-4000-8000-000000000002',dual:'aaaaaaaa-0000-4000-8000-000000000003',reference:'aaaaaaaa-0000-4000-8000-000000000004',frozen:'aaaaaaaa-0000-4000-8000-000000000005'};
const SET_PATH='src/lib/evals/fixtures/gold/facts/us-release.json';
const REPLAY_PATH='src/lib/evals/fixtures/replay/facts.frozen.json';
const PAIR_PATH='src/lib/evals/fixtures/gold/facts/pairs-us.json';
const REF_PATH='src/lib/evals/fixtures/reference/chaosai/macro-strategy.json';
const FROZEN_COPY='docs/evals/2026-11-20/facts-replay_frozen-aaaaaaaa.json';
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const EMPTY={module:'facts' as const,rows:[]};
const REQ={issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2024-06-30'};
const REC={code_version:'c'.repeat(40),at:'2026-11-20T00:00:00Z'};
const EXP={projection_hash:projectionHash(EMPTY),projection:EMPTY};
const REPLAY_BYTES=enc({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'f1',request:REQ,setup:{setup_sha256:'5'.repeat(64),today:'2026-11-20'},recorded:REC,expected:EXP}]});
const LIVE_BYTES=enc({schema_version:1,module:'facts',mode:'live',cases:[{case_id:'l1',request:REQ,recorded:{...REC,state_rev:7},expected:EXP}]});
const sample=(p:Partial<ReferenceSample>={}):ReferenceSample=>({sample_id:'R1',doc:'macro-strategy',doc_sha256:'a'.repeat(64),line:1,page_url:'https://chaos.example/macro',page_sha256:'b'.repeat(64),captured_at:'2026-11-04T00:00:00Z',
 as_displayed:'1',parsed_value:'1',parsed_unit:'index',their_declared_source:null,our_target:{series_id:'cn.cpi',period_end:'2026-09-30',which:'latest'},canary:false,...p});
const CANARY=sample({sample_id:'canary',as_displayed:CANARY_VALUE,parsed_value:CANARY_VALUE,our_target:{series_id:CANARY_SERIES,period_end:'2026-09-30',which:'latest'},canary:true});
const REF_BYTES=enc({schema_version:1,samples:[sample(),CANARY]});
const AUDIT_DIR='docs/audits/2026-11-20-release-audit';
const AUDIT_FILES=new Map<string,Uint8Array>([[`${AUDIT_DIR}/01-codex-round1.md`,new TextEncoder().encode('**Verdict: ready.**\n\nNo findings.\n')]]);
const DESCENDANT='f'.repeat(40);
const EXPERT_FILE='docs/evals/2026-11-20/expert-sampling-facts-1.json';
const DOC={document_id:{kind:'edgar_accession',value:'0000999061-24-000001'},sha256:'0'.repeat(64),locator:{page:1}};
const TH={max_fail:0,min_coverage_optional:'0.95'};
const GOLD={format:'f6' as const,ready:true,pending:0,provenance_gaps:0};

const goldCase=(case_id:string,market:'US'|'CN'='US',kind:GoldCase['provenance_kind']='transcribed'):GoldCase=>({
 case_id,subject:market==='US'?{market,cik:'9990601'}:{market,ticker:'600000.SH'},
 target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:'1',unit_label:'In millions',scale:'1000000'},canonical:{value:'1000000'},binding:'document',as_of:null,
 source:{document_type:'10-K',url:'https://www.sec.gov/Archives/edgar/data/9990601/x.htm',sha256:'0'.repeat(64)},provenance_kind:kind,
 recorded_by:'r1',recorded_at:'2026-11-01T00:00:00Z',reviewed_by:'r2',reviewed_at:'2026-11-02T00:00:00Z',retracted:null,notes:'',required:true,pending:false,provenance_gaps:[],
});
const goldSet=(path:string,sha256:string,cases:GoldCase[]):GoldSet=>({schema_version:1,format:'f6',set_id:path.replace(/^.*fixtures\/gold\//,'').replace(/\.json$/,''),version:1,module:'facts',artifact_class:'public',
 module_implementers:['claude-code'],review_required:false,tolerance:{rel:'0'},thresholds:TH,optional_cases:[],history:[],cases,ready:true,path,sha256});
const passCase=(case_id:string,result:CaseReport['outcome']={result:'pass'}):CaseReport=>({case_id,required:true,outcome:result,left:'1000000',right:'1000000',abs_diff:'0',rel_diff:'0',tolerance:'0',provenance:null,detail:{}});

interface Fx{
 sets:Record<string,GoldSet>;reports:Record<keyof typeof ID,EvalReport>;rowPatch:Partial<Record<keyof typeof ID,Partial<EvalRunRow>>>;
 manifest:Record<string,any>;expert:Record<string,any>;lock:GoldLock;fresh:Record<string,string>;freshRows?:Record<string,FreshnessRow>;noRuns?:boolean;noPair?:boolean;pairIndependence?:'same_feed'|'independent_publication';now?:string;noFresh?:boolean;keepSummary?:Set<string>;
 /** files missing at evidence_commit (e.g. present only in a working tree) */
 uncommitted?:Set<string>;origin?:string|null;
 /** the GitHub run --online returns; default: success at RELEASE; 'offline' = no --online */
 online?:{conclusion:string|null;head_sha:string}|null|'offline';
}
function report(run_id:string,kind:EvalKind,o:{mode?:'ci'|'report';privileged?:boolean;evidence?:EvidenceClass;path:string;sha256:string;cases?:CaseReport[]}):EvalReport{
 const cases=o.cases??[passCase('X/revenue'),passCase('X/assets')];
 const evidence=o.evidence??'truth';
 return {schema_version:1,run_id,kind,module:'facts',mode:o.mode??'report',privileged:o.privileged??true,artifact_class:'public',
  set:{id:'s',version:1,sha256:o.sha256,format:'f6',path:o.path},evaluator_code_version:RELEASE,dirty:false,started_at:'2026-11-20T00:00:00Z',finished_at:'2026-11-20T00:05:00Z',
  environment:{db_host:'db.example.supabase.co',app_origin:null,db_state_rev:7},thresholds:TH,provenance:{verified:{artifacts:true,sources:true}},
  summary:summarize(cases,{thresholds:TH,gold:GOLD,subset:false,evidenceClass:evidence}),cases};
}
function fx():Fx{
 const S={set:'1'.repeat(64),replay:sha(REPLAY_BYTES),live:sha(LIVE_BYTES),pair:'3'.repeat(64),ref:sha(REF_BYTES)};
 const set=goldSet(SET_PATH,S.set,[goldCase('X/revenue'),goldCase('X/assets')]);
 const selected=seededSelection(set.cases,'seed-1',1,2);
 return {
  sets:{[SET_PATH]:set,[PAIR_PATH]:goldSet(PAIR_PATH,S.pair,[goldCase('X/revenue'),goldCase('X/assets')])},
  reports:{
   official:report(ID.official,'official_reconciliation',{path:SET_PATH,sha256:S.set}),
   live:report(ID.live,'replay_consistency',{path:REPLAY_PATH.replace('frozen','live'),sha256:S.live,cases:[passCase('l1',{result:'identical'})]}),
   dual:report(ID.dual,'dual_source',{path:PAIR_PATH,sha256:S.pair}),
   reference:report(ID.reference,'reference_regression',{privileged:false,evidence:'comparison',path:REF_PATH,sha256:S.ref,cases:[passCase('R1',{result:'within'})]}),
   frozen:report(ID.frozen,'replay_consistency',{mode:'ci',privileged:false,path:REPLAY_PATH,sha256:S.replay,cases:[passCase('f1',{result:'identical'})]}),
  },
  rowPatch:{},
  manifest:{schema_version:1,module:'facts',release_commit:RELEASE,evidence_commit:RELEASE,prepared_by:'owner',prepared_at:'2026-11-21T00:00:00Z',
   scope:{markets:['US'],universes:['sp500'],data_state_rev_min:'5'},gold_approval:'enforced',
   evidence:{
    official_reconciliation:{run_id:ID.official,report:`docs/evals/2026-11-20/${ID.official}.json`},
    replay_frozen:{ci_run_url:'https://github.com/osborn-studio/OsbornAlpha/actions/runs/123456',report:FROZEN_COPY,report_sha256:'AUTO',ci_check:'manual'},
    replay_live:{run_id:ID.live,report:`docs/evals/2026-11-20/${ID.live}.json`},
    dual_source:{not_applicable:{reason:'no second source yet',approved_by:'owner',at:'2026-11-21T00:00:00Z'}},
    reference_regression:{not_applicable:{reason:'no samples for facts',approved_by:'owner',at:'2026-11-21T00:00:00Z'}},
    expert_sampling:{file:EXPERT_FILE},
    model_audit:{dir:AUDIT_DIR},
   },waivers:[]},
  expert:{schema_version:1,module:'facts',sampled_at:'2026-11-20T00:00:00Z',expert:{alias:'E1',background:'CPA',independence:'not an implementer',contact_held_by:'owner'},
   population:{set_id:set.set_id,set_version:1,set_sha256:S.set,case_count:2,evaluated_run_id:ID.official,db_state_rev:'7'},
   selection:{method:'seeded_sha256',seed:'seed-1',companies:1,cases_per_company:2,selected_case_ids:selected},
   checks:selected.map(case_id=>({case_id,our_value:'1000000',document_value:'1000000',document:DOC,verdict:'agree',note:''})),
   basis_review:[],summary:{agree:2,disagree:0,cannot_verify:0},follow_ups:[]},
  lock:{files:[{path:SET_PATH,sha256:S.set,version:1,format:'f6'},{path:PAIR_PATH,sha256:S.pair,version:1,format:'f6'}]},
  fresh:{'facts.us':'fresh'},
 };
}
async function depsOf(f:Fx):Promise<{deps:ManifestDeps;manifest:Record<string,any>}>{
 const files=new Map<string,Uint8Array>();const rows=new Map<string,EvalRunRow>();
 for(const [k,r] of Object.entries(f.reports) as [keyof typeof ID,EvalReport][]){
  const bytes=enc(r);
  if(k==='frozen'){files.set(FROZEN_COPY,bytes);continue;}
  const ref=`docs/evals/2026-11-20/${r.run_id}.json`;files.set(ref,bytes);
  rows.set(r.run_id,{run_id:r.run_id,kind:r.kind,module:r.module,mode:r.mode,privileged:r.privileged,artifact_class:r.artifact_class,set_id:r.set.id,set_version:r.set.version,set_sha256:r.set.sha256,
   evaluator_code_version:r.evaluator_code_version,started_at:r.started_at,finished_at:r.finished_at,status:statusOfGate(r.summary.gate),summary:r.summary,report_ref:ref,report_sha256:sha(bytes),triggered_by:'script',...f.rowPatch[k]});
 }
 files.set(EXPERT_FILE,enc(f.expert));for(const [p,b] of AUDIT_FILES)files.set(p,b);
 files.set(`${AUDIT_DIR}/index.json`,enc({topic:'t',target:{path:'docs/x.md'},rounds:[{n:1,target_sha256:sha('spec\n'),target_git_ref:'d'.repeat(40),prompt_file:null,report_file:'01-codex-round1.md',model:'gpt-6-astra',effort:'medium',verdict:'ready',findings:{p1:0,p2:0,p3:0}}],dispositions:[],open:{owner:[],verify:[]},final_verdict:'ready'}));
 const release=new Map<string,Uint8Array>([[REPLAY_PATH,REPLAY_BYTES],[REPLAY_PATH.replace('frozen','live'),LIVE_BYTES],[REF_PATH,REF_BYTES]]);
 const m=structuredClone(f.manifest);
 if(m.evidence.replay_frozen?.report_sha256==='AUTO')m.evidence.replay_frozen.report_sha256=sha(files.get(FROZEN_COPY)!);
 const deps:ManifestDeps={
  readAt:(c,p)=>c===m.evidence_commit?(f.uncommitted?.has(p)?null:files.get(p)??release.get(p)??null):c===RELEASE?release.get(p)??null:null,
  lockAt:()=>f.lock,
  loadSetAt:(_c,p)=>{const s=f.sets[p];if(!s)throw new Error(`no set ${p}`);return s;},
  isAncestor:(a,b)=>a===b||(a===RELEASE&&b===DESCENDANT),
  originRepo:()=>f.origin===undefined?'osborn-studio/osbornalpha':f.origin,
  ...(f.online==='offline'?{}:{ciRun:async()=>{const o=f.online;return o===undefined?{conclusion:'success',head_sha:RELEASE}:o==='offline'?null:o;}}),
  getRun:f.noRuns?undefined:async id=>rows.get(id)??null,
  freshness:f.noFresh?undefined:async d=>f.freshRows?.[d]??(f.fresh[d]?{expected_cadence:'daily',last_ok_at:f.fresh[d]==='fresh'?'2026-11-20T12:00:00Z':'2026-11-10T00:00:00Z',consecutive_errors:0}:null),
  audit:{gitShow:()=>new TextEncoder().encode('spec\n')},
  pairs:f.noPair?[]:[{pair_id:'s',module:'facts',left:{source:'a',upstream:'u'},right:{source:'b',upstream:'v'},tolerance:{rel:'0.005'},independence:f.pairIndependence??'independent_publication'}],
  now:()=>new Date(f.now??'2026-11-22T00:00:00Z'),
 };
 return {deps,manifest:m};
}
async function run(f:Fx):Promise<{codes:string[];notices:string[]}>{
 const {deps,manifest}=await depsOf(f);
 const notices:import('./finding').ValidatorFinding[]=[];
 const found=await validateManifest(manifest,deps,'manifest',{notices});
 return {codes:[...new Set(found.map(x=>x.code))].sort(),notices:notices.map(n=>n.code)};
}
const codes=async(f:Fx)=>(await run(f)).codes;
const resummarize=(r:EvalReport)=>{r.summary=summarize(r.cases,{thresholds:r.thresholds,gold:r.summary.gold,subset:false,evidenceClass:r.summary.evidence_class});};

describe('validateManifest (spec §10)',()=>{

 it('accepts a complete manifest: privileged report runs, frozen ci copy, waived dual/reference, expert and audit',async()=>expect(await codes(fx())).toEqual([]));
 it('rejects malformed manifests',async()=>{
  const f=fx();f.manifest.release_commit='abc';expect(await codes(f)).toEqual(['manifest_invalid']);
  const g=fx();g.manifest.scope.data_state_rev_min=5;expect(await codes(g)).toEqual(['manifest_invalid']);
 });
 it("rejects a mode='ci' run used as official_reconciliation",async()=>{
  const f=fx();f.reports.official.mode='ci';expect(await codes(f)).toContain('manifest_mode');
 });
 it('rejects a non-privileged official run and unverified provenance',async()=>{
  const f=fx();f.reports.official.privileged=false;expect(await codes(f)).toContain('manifest_privileged');
  const g=fx();g.reports.official.provenance={verified:{artifacts:true,sources:false}};expect(await codes(g)).toEqual(['manifest_unverified']);
 });
 it('authenticates the report bytes against dq_eval_runs.report_sha256 and needs the row',async()=>{
  const f=fx();f.rowPatch.official={report_sha256:'0'.repeat(64)};expect(await codes(f)).toEqual(['manifest_report_sha']);
  const g=fx();g.manifest.evidence.official_reconciliation.run_id='aaaaaaaa-0000-4000-8000-0000000000ff';expect(await codes(g)).toContain('manifest_run_missing');
  const h=fx();h.rowPatch.official={report_ref:'docs/evals/2026-11-20/other.json'};expect(await codes(h)).toContain('manifest_report_ref');
 });
 it('fails without database access (getRun or dq_freshness)',async()=>{
  const f=fx();f.noRuns=true;expect(await codes(f)).toContain('manifest_no_db');
  const g=fx();g.noFresh=true;expect(await codes(g)).toEqual(['manifest_no_db']);
 });
 it('accepts frozen replay as a ci run whose committed copy matches report_sha256; rejects a mismatching copy or a report-mode copy',async()=>{
  const f=fx();f.manifest.evidence.replay_frozen.report_sha256='0'.repeat(64);expect(await codes(f)).toEqual(['manifest_report_sha']);
  const g=fx();g.reports.frozen.mode='report';expect(await codes(g)).toEqual(['manifest_mode']);
  const h=fx();h.manifest.evidence.replay_frozen.ci_check='automatic';expect(await codes(h)).toEqual(['manifest_ci_run']);
  const i=fx();i.manifest.evidence.replay_frozen.ci_run_url='https://example.com/run/1';expect(await codes(i)).toEqual(['manifest_ci_run']);
 });
 it('accepts reference_regression only from a privileged=false comparison run',async()=>{
  const f=fx();f.manifest.evidence.reference_regression={run_id:ID.reference};expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.evidence.reference_regression={run_id:ID.reference};g.reports.reference.privileged=true;expect(await codes(g)).toEqual(['manifest_privileged']);
  const h=fx();h.manifest.evidence.reference_regression={run_id:ID.reference};h.reports.reference.summary.evidence_class='truth';resummarize(h.reports.reference);expect(await codes(h)).toEqual(['manifest_evidence_class','manifest_summary_mismatch']);
 });
 it('P6: the dual_source class comes only from the F6 registration — same_feed is an adapter check whatever the report says',async()=>{
  const f=fx();f.manifest.evidence.dual_source={run_id:ID.dual};expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.evidence.dual_source={run_id:ID.dual};g.pairIndependence='same_feed';expect(await codes(g)).toContain('manifest_adapter_check');
  // a report that merely CLAIMS adapter_check under an independent registration is a summary mismatch, not trusted either way
  const h=fx();h.manifest.evidence.dual_source={run_id:ID.dual};h.reports.dual.summary.evidence_class='adapter_check';resummarize(h.reports.dual);
  const found=await codes(h);expect(found).toContain('manifest_summary_mismatch');expect(found).not.toContain('manifest_adapter_check');
 });
 it('a dual_source report whose pair is not registered in F6 is manifest_invalid (only not_applicable is acceptable then)',async()=>{
  const f=fx();f.manifest.evidence.dual_source={run_id:ID.dual};f.noPair=true;expect(await codes(f)).toEqual(['manifest_invalid']);
  const g=fx();g.noPair=true;expect(await codes(g)).toEqual([]);   // the default fixture waives dual_source
 });
 it('rejects synthetic gold, dirty trees and evidence from another commit',async()=>{
  const f=fx();f.sets[SET_PATH].cases[0].provenance_kind='synthetic';expect(await codes(f)).toEqual(['manifest_synthetic']);
  const g=fx();g.reports.live.dirty=true;expect(await codes(g)).toEqual(['manifest_dirty']);
  const h=fx();h.reports.frozen.evaluator_code_version='9'.repeat(40);expect(await codes(h)).toEqual(['manifest_code_version']);
  const i=fx();i.rowPatch.live={evaluator_code_version:'9'.repeat(40)};expect(await codes(i)).toEqual(['manifest_code_version']);
 });
 it('rejects a legacy_plan2 set as evidence',async()=>{
  const f=fx();f.sets[SET_PATH].format='legacy_plan2';expect(await codes(f)).toContain('manifest_legacy_set');
 });
 it('recomputes summary and gate from cases[]',async()=>{
  const f=fx();f.reports.official.summary={...f.reports.official.summary,population:99};expect(await codes(f)).toEqual(['manifest_summary_mismatch']);
  const g=fx();g.reports.official.cases[0]={...g.reports.official.cases[0],outcome:{result:'fail',reason:'value'}};resummarize(g.reports.official);
  expect(await codes(g)).toEqual(expect.arrayContaining(['manifest_gate','manifest_run_status']));
 });
 it('requires a gold-set report set to be in lock.json with the same sha256',async()=>{
  const f=fx();f.lock={files:f.lock.files.filter(x=>x.path!==SET_PATH)};expect(await codes(f)).toContain('manifest_lock');
 });
 it('authenticates replay fixtures by their committed bytes (they are not gold sets, so not in lock.json)',async()=>{
  const f=fx();f.reports.frozen.set.sha256='2'.repeat(64);expect(await codes(f)).toEqual(['manifest_fixture']);
  const g=fx();g.reports.live.set.sha256='5'.repeat(64);expect(await codes(g)).toEqual(['manifest_fixture']);
 });
 it('requires scope.markets to equal the set markets exactly, and data_state_rev_min ≤ official db_state_rev',async()=>{
  const f=fx();f.manifest.scope.markets=['US','CN'];f.fresh['facts.cn']='fresh';expect(await codes(f)).toEqual(['manifest_scope_markets']);
  const g=fx();g.sets[SET_PATH].cases[1]=goldCase('X/assets','CN');expect(await codes(g)).toContain('manifest_scope_markets');
  const h=fx();h.manifest.scope.data_state_rev_min='8';expect(await codes(h)).toEqual(['manifest_state_rev']);
 });
 it('requires dq_freshness fresh for every market dataset',async()=>{
  const f=fx();f.fresh['facts.us']='stale';expect(await codes(f)).toEqual(['manifest_stale']);
  // P1-4: freshness is recomputed at prepared_at from cadence / last_ok_at / errors — a stored 'fresh' status is ignored
  const old=fx();old.freshRows={'facts.us':{expected_cadence:'daily',last_ok_at:'2026-11-01T00:00:00Z',consecutive_errors:0,status:'fresh'} as FreshnessRow};expect(await codes(old)).toEqual(['manifest_stale']);
  const err=fx();err.freshRows={'facts.us':{expected_cadence:'daily',last_ok_at:'2026-11-20T12:00:00Z',consecutive_errors:2}};expect(await codes(err)).toEqual(['manifest_stale']);
  const g=fx();delete g.fresh['facts.us'];expect(await codes(g)).toEqual(['manifest_stale']);
 });
 it('non-waivable items cannot be not_applicable; waivable ones need owner approval',async()=>{
  const na={not_applicable:{reason:'r',approved_by:'owner',at:'2026-11-21T00:00:00Z'}};
  for(const item of ['official_reconciliation','replay_frozen','model_audit','expert_sampling']){
   const f=fx();f.manifest.evidence[item]=na;expect(await codes(f)).toContain('manifest_non_waivable');
  }
  const f=fx();f.manifest.evidence.replay_live=na;expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.evidence.dual_source={not_applicable:{reason:'r',approved_by:'someone',at:'2026-11-21T00:00:00Z'}};expect(await codes(g)).toEqual(['manifest_waiver_invalid']);
  const h=fx();delete h.manifest.evidence.replay_live;expect(await codes(h)).toEqual(['manifest_evidence_missing']);
 });
 it("gold_approval 'process' needs a gold_approval waiver; waivers cannot waive anything else",async()=>{
  const f=fx();f.manifest.gold_approval='process';expect(await codes(f)).toEqual(['manifest_gold_approval']);
  f.manifest.waivers=[{item:'gold_approval',reason:'no CODEOWNERS yet (D2)',approved_by:'owner',at:'2026-11-21T00:00:00Z'}];expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.waivers=[{item:'expert_sampling',reason:'r',approved_by:'owner',at:'2026-11-21T00:00:00Z'}];expect(await codes(g)).toEqual(['manifest_waiver_not_allowed']);
 });
 it('validates the expert record in release mode against the official run',async()=>{
  const f=fx();f.expert.population.evaluated_run_id=ID.live;expect(await codes(f)).toEqual(['manifest_expert_run']);
  const g=fx();g.expert.checks[0].verdict='disagree';g.expert.summary={agree:1,disagree:1,cannot_verify:0};
  g.expert.follow_ups=[{ref:g.expert.checks[0].case_id,action:'fix',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}];
  expect(await codes(g)).toEqual(['expert_follow_up_open']);
 });
 it('validates the model audit directory in release mode',async()=>{
  const f=fx();f.manifest.evidence.model_audit={dir:`${AUDIT_DIR}/missing`};expect(await codes(f)).toEqual(['audit_index_missing']);
 });
 it('P1-2: membership comes from the authenticated set — a dropped failing case, an extra case or raised thresholds are caught',async()=>{
  const f=fx();f.reports.official.cases=[f.reports.official.cases[0]];resummarize(f.reports.official);
  expect(await codes(f)).toEqual(expect.arrayContaining(['manifest_population','manifest_summary_mismatch','manifest_gate']));
  const g=fx();g.reports.official.cases.push(passCase('X/extra'));resummarize(g.reports.official);
  expect(await codes(g)).toEqual(expect.arrayContaining(['manifest_population','manifest_summary_mismatch']));
  const h=fx();h.reports.official.cases[0]={...h.reports.official.cases[0],outcome:{result:'fail',reason:'value'}};
  h.reports.official.thresholds={max_fail:5,min_coverage_optional:'0.95'};h.reports.official.summary=summarize(h.reports.official.cases,{thresholds:h.reports.official.thresholds,gold:GOLD,subset:false,evidenceClass:'truth'});
  expect(await codes(h)).toEqual(expect.arrayContaining(['manifest_summary_mismatch','manifest_gate']));
 });
 it('P1-3: evidence is read at evidence_commit (a descendant of release_commit); no working-tree files, no absolute or .. paths',async()=>{
  const f=fx();f.uncommitted=new Set([EXPERT_FILE]);expect(await codes(f)).toEqual(['manifest_report_missing']);
  const g=fx();g.manifest.evidence_commit=DESCENDANT;expect(await codes(g)).toEqual([]);
  const h=fx();h.manifest.evidence_commit='9'.repeat(40);expect(await codes(h)).toContain('manifest_evidence_commit');
  const i=fx();i.manifest.evidence.expert_sampling={file:'/etc/passwd'};expect(await codes(i)).toContain('manifest_path');
  const j=fx();j.manifest.evidence.model_audit={dir:'docs/../../outside'};expect(await codes(j)).toContain('manifest_path');
  const k=fx();delete k.manifest.evidence_commit;expect(await codes(k)).toEqual(['manifest_invalid']);
 });
 it('P1-3 / R2-2: the CI run must belong to the origin repository; --online checks success at release_commit; offline is a blocking finding',async()=>{
  const o=fx();o.online='offline';const off=await run(o);expect(off.codes).toEqual(['manifest_ci_unverified']);expect(off.notices).toEqual(['manifest_ci_unverified']);
  const f=fx();f.origin='someone/else';expect(await codes(f)).toEqual(['manifest_ci_repo']);
  const g=fx();g.online={conclusion:'success',head_sha:RELEASE};const on=await run(g);expect(on.codes).toEqual([]);expect(on.notices).toEqual([]);
  const h=fx();h.online={conclusion:'failure',head_sha:RELEASE};expect(await codes(h)).toEqual(['manifest_ci_run']);
  const i=fx();i.online={conclusion:'success',head_sha:'9'.repeat(40)};expect(await codes(i)).toEqual(['manifest_ci_run']);
  const j=fx();j.online=null;expect(await codes(j)).toEqual(['manifest_ci_run']);
 });
 it('P2-2: the real Task 14 reference report (canary in cases[], excluded from the summary) passes the validator',async()=>{
  const run1=await evaluateReference([sample(),CANARY],[],{today:'2026-11-20',evaluatorCodeVersion:RELEASE,reader:{value:async t=>({value_text:t.series_id===CANARY_SERIES?'1':'1',unit:'index',run_id:'r1'})}});
  const f=fx();
  f.reports.reference={...f.reports.reference,cases:run1.cases,summary:referenceSummary(run1.result,REFERENCE_THRESHOLDS),thresholds:REFERENCE_THRESHOLDS};
  f.manifest.evidence.reference_regression={run_id:ID.reference};
  expect(run1.cases.map(c=>c.case_id)).toEqual(['R1','canary']);
  expect(await codes(f)).toEqual([]);
 });
 it('P2-3: official evidence on a review_required set needs a second reviewer on every case',async()=>{
  const f=fx();f.sets[SET_PATH].review_required=true;f.sets[SET_PATH].cases[0].reviewed_by=null;expect(await codes(f)).toEqual(['manifest_review_missing']);
  const g=fx();g.sets[SET_PATH].review_required=true;expect(await codes(g)).toEqual([]);
 });
 it('P4: prepared_at must follow every referenced run, not be in the future, and freshness must be establishable at that time',async()=>{
  const early=fx();early.manifest.prepared_at='2026-11-20T00:01:00Z';expect(await codes(early)).toEqual(expect.arrayContaining(['manifest_prepared_before_run']));
  const back=fx();back.manifest.prepared_at='2026-11-19T00:00:00Z';expect(await codes(back)).toEqual(expect.arrayContaining(['manifest_prepared_before_run','manifest_freshness_unverifiable']));
  const unfinished=fx();unfinished.rowPatch.official={finished_at:null};expect(await codes(unfinished)).toContain('manifest_run_unfinished');
  const future=fx();future.now='2026-11-20T10:00:00Z';expect(await codes(future)).toEqual(['manifest_prepared_future']);
  const later=fx();later.freshRows={'facts.us':{expected_cadence:'daily',last_ok_at:'2026-11-21T06:00:00Z',consecutive_errors:0}};expect(await codes(later)).toEqual(['manifest_freshness_unverifiable']);
  const frozen=fx();frozen.manifest.prepared_at='2026-11-20T00:01:00Z';frozen.reports.live.finished_at='2026-11-19T00:00:00Z';
  expect(await codes(frozen)).toEqual(expect.arrayContaining(['manifest_prepared_before_run']));   // official + frozen copy still finish at 00:05
  const bad=fx();bad.manifest.prepared_at='2026-13-45';expect(await codes(bad)).toEqual(['manifest_invalid']);
  const bad2=fx();bad2.manifest.prepared_at='2026-02-30T00:00:00Z';expect(await codes(bad2)).toEqual(['manifest_invalid']);
 });
 it('P5: replay slots check the fixture mode and module (frozen ≠ live)',async()=>{
  const LIVE_PATH=REPLAY_PATH.replace('frozen','live');
  const a=fx();a.reports.frozen.set={...a.reports.frozen.set,path:LIVE_PATH,sha256:sha(LIVE_BYTES)};expect(await codes(a)).toContain('manifest_fixture');
  const b=fx();b.reports.live.set={...b.reports.live.set,path:REPLAY_PATH,sha256:sha(REPLAY_BYTES)};expect(await codes(b)).toContain('manifest_fixture');
  const c=fx();c.manifest.module='metrics';expect(await codes(c)).toContain('manifest_module');
 });
 it('minors: gold set module, run_id + not_applicable, expert db_state_rev, row/report mismatches',async()=>{
  const a=fx();a.sets[SET_PATH].module='metrics';expect(await codes(a)).toContain('manifest_module');
  const b=fx();b.manifest.evidence.dual_source={run_id:ID.dual,not_applicable:{reason:'r',approved_by:'owner',at:'2026-11-21T00:00:00Z'}};expect(await codes(b)).toEqual(['manifest_invalid']);
  const c=fx();c.expert.population.db_state_rev='6';expect(await codes(c)).toEqual(['manifest_expert_run']);
  const d=fx();d.rowPatch.official={kind:'dual_source'};expect(await codes(d)).toContain('manifest_report_run');
  const e=fx();e.rowPatch.official={set_sha256:'7'.repeat(64)};expect(await codes(e)).toContain('manifest_report_run');
  const g=fx();g.rowPatch.official={privileged:false};expect(await codes(g)).toContain('manifest_privileged');
  const h=fx();h.expert.follow_ups=[{ref:'X',action:'a',owner:'owner',due:'2026-12-01',closed_at:'2026-11-25T00:00:00Z',closure_ref:'gold:facts/us-release@9'}];expect(await codes(h)).toEqual(['expert_follow_up_open']);
 });
 it('R2-1 at the CLI: offline the --manifest check is ok:false and runValidate exits 1; with --online and a verified run it exits 0',async()=>{
  const f=fx();
  const {deps,manifest}=await depsOf(f);
  const root=mkdtempSync(join(tmpdir(),'f6-manifest-cli-'));
  try{
   writeFileSync(join(root,'m.json'),JSON.stringify(manifest));
   const handlers=[manifestHandler((_root,o)=>o.online?deps:{...deps,ciRun:undefined})];
   const off=await runValidate(['--manifest','m.json'],{root,handlers});
   expect(off.exitCode).toBe(1);expect(off.output.checks.manifest.ok).toBe(false);
   expect((off.output.checks.manifest.findings as {code:string}[]).map(x=>x.code)).toEqual(['manifest_ci_unverified']);
   const on=await runValidate(['--manifest','m.json','--online'],{root,handlers});
   expect(on).toMatchObject({exitCode:0,output:{ok:true,checks:{manifest:{ok:true,findings:[]}}}});
  }finally{rmSync(root,{recursive:true,force:true});}
 });
 it('R2-3: adapter → official report → manifest for a derived-metric case: verified artifacts come from the input chains',async()=>{
  const w=await memoryWorld();
  const FY={start:'2023-01-01',end:'2023-12-31'},A1='0009990611-24-000001';
  expect((await w.sync(companyFactsDoc('9990611','ZZ Eval Unit Co',[{tag:'Revenues',...FY,val:'1000',accn:A1,filed:'2024-02-15'},{tag:'CostOfRevenue',...FY,val:'600',accn:A1,filed:'2024-02-15'},{tag:'GrossProfit',...FY,val:'400',accn:A1,filed:'2024-02-15'}]))).detail.published).toBe(1);
  const reader=privilegedFactsReader({db:w.db,tables:w.overlay,stateRev:async()=>null,storage:memoryRawStorage(w.storage.objects),parsers:LANDED_PARSERS});
  const bytes=new TextEncoder().encode('the 10-K bytes');
  const margin=gcase({case_id:'ZZEVU/gross_margin/2023',binding:'current',as_of:'2026-11-20',canonical:{value:'0.4'},printed:{text:'0.4',unit_label:'ratio',scale:'1'},
   target:{type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:FORMULA_VERSION,unit:{kind:'ratio'}},
   source:{...gcase().source,sha256:sha(bytes)},reviewed_by:'r2',reviewed_at:'2026-11-07T00:00:00Z'});
  const set=gset([margin],{path:SET_PATH,sha256:'1'.repeat(64)});
  const o=await runGoldSet({set,mode:'report',reader,env:{today:'2026-11-20',now:()=>new Date('2026-11-20T00:00:00.000Z'),evaluatorCodeVersion:RELEASE,dirty:false},
   environment:{db_host:'db.example.supabase.co',app_origin:null,db_state_rev:7},runId:ID.official,verify:{artifacts:true,sources:true},fetchSource:async()=>bytes});
  expect(o.report.cases[0].outcome).toEqual({result:'pass'});
  expect((o.report.cases[0].detail.inputs as unknown[]).length).toBeGreaterThan(0);
  expect(o.report.cases[0].provenance?.object_path).toBeUndefined();
  expect(o.report.provenance.verified).toEqual({artifacts:true,sources:true});
  const f=fx();f.sets[SET_PATH]=set;f.reports.official=o.report;
  const {deps,manifest}=await depsOf(f);
  const official=(await validateManifest(manifest,deps)).filter(x=>x.where.includes('evidence.official_reconciliation'));
  expect(official).toEqual([]);
 });
});
