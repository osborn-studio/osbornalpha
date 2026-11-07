// src/lib/judgments/methodology-sync.test.ts
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {readFileSync} from 'node:fs';
import {LICENSES_PATH,applyMethodologySync,horizonCalendarDays,licenseProblems,planExitCode,planMethodologySync,reachableOriginKeys,validateLicenseTable,validateMethodology} from './methodology-sync';
import type {LicenseTable} from './methodology-sync';
import {ORIGINS} from './origins';
import type {Methodology} from './types';

let root:string;
const put=(rel:string,text:string)=>{mkdirSync(dirname(join(root,rel)),{recursive:true});writeFileSync(join(root,rel),text);};
const method=(o:Partial<Methodology>={}):Methodology=>({id:'sync_test',version:'v1',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',subject_types:['macro_region'],input_kinds:['macro_snapshot'],title:{zh:'同步测试',en:'sync test'},doc:'docs/m.md',params:{grace_days:30,label_policy:'cutoff_vintage'},horizon:{unit:'calendar_months',n:3},deps:['data/rules.json'],module:'src/lib/m/method.ts',status:'active',
 gather:async()=>[],resolveTarget:async()=>({kind:'period',period:'2026-01'}),compute:()=>({abstained:true,reason:'test'}),condition:()=>{throw new Error('unused');},...o});
const opts=(o:Record<string,unknown>={})=>({repoRoot:root,codeVersion:'test0001',...o});
beforeAll(()=>{root=mkdtempSync(join(tmpdir(),'f4-sync-'));put('src/lib/m/method.ts','export const x=1;\n');put('docs/m.md','# m\n');put('data/rules.json','{}\n');});
afterAll(()=>{rmSync(root,{recursive:true,force:true});});

describe('planMethodologySync / applyMethodologySync (spec §4.1, §5.1b)',()=>{
 it('register → resync → drift when the implementation changes without a new version (exit 2, nothing written)',async()=>{
  const db=memoryJudgmentsDb();
  const p1=await planMethodologySync([method()],db,opts());
  expect(p1.map(p=>[p.key,p.action,p.problems])).toEqual([['sync_test@v1','register',[]]]);
  expect(p1[0].row).toMatchObject({methodology_id:'sync_test',version:'v1',publishable:false,status:'active',code_version:'test0001',doc_path:'docs/m.md',markets:null,upstream:{}});
  expect(planExitCode(p1)).toBe(0);
  await applyMethodologySync(p1,db);
  expect((await db.methodology('sync_test','v1'))?.formula_hash).toBe(p1[0].row!.formula_hash);
  expect((await planMethodologySync([method()],db,opts()))[0].action).toBe('resync');
  put('src/lib/m/method.ts','export const x=2;\n');
  const p3=await planMethodologySync([method()],db,opts());
  expect(p3[0].action).toBe('drift');expect(planExitCode(p3)).toBe(2);
  await expect(applyMethodologySync(p3,db)).rejects.toMatchObject({code:'formula_hash_drift'});
  put('src/lib/m/method.ts','export const x=1;\n');
  const t=await planMethodologySync([method({title:{zh:'改名',en:'renamed'}})],db,opts());
  expect(t[0]).toMatchObject({action:'drift',problems:['immutable_columns_changed:title_zh,title_en']});
 });
 it('status changes are updates; publishable needs an explicit owner confirmation and is otherwise kept',async()=>{
  const db=memoryJudgmentsDb();
  await applyMethodologySync(await planMethodologySync([method()],db,opts()),db);
  expect((await planMethodologySync([method({status:'retired'})],db,opts()))[0].action).toBe('update');
  const noConfirm=await planMethodologySync([method()],db,opts({publish:new Set(['sync_test@v1'])}));
  expect(noConfirm[0]).toMatchObject({action:'invalid',problems:['owner_confirmation_required']});
  const unlicensed=await planMethodologySync([method()],db,opts({publish:new Set(['sync_test@v1']),ownerConfirmation:'owner 2026-11-20: all inputs licensed'}));
  expect(unlicensed[0]).toMatchObject({action:'invalid',problems:['license_unconfirmed:macro_snapshot×macro_workbench']});
  const confirmed:LicenseTable={'macro_snapshot×macro_workbench':{status:'confirmed',confirmed_by:'owner',confirmed_at:'2026-11-20',evidence:'contract #1'}};
  const ok=await planMethodologySync([method()],db,opts({publish:new Set(['sync_test@v1']),ownerConfirmation:'owner 2026-11-20: all inputs licensed',licenses:confirmed}));
  expect(ok[0].row!.formula_hash).toBe(unlicensed[0].row!.formula_hash);   // D3: publishable never changes formula_hash
  expect(ok[0]).toMatchObject({action:'update',reason:'owner_confirmed:owner 2026-11-20: all inputs licensed'});
  expect(ok[0].row!.publishable).toBe(true);
  await applyMethodologySync(ok,db);
  const kept=await planMethodologySync([method()],db,opts({licenses:confirmed}));
  expect(kept[0]).toMatchObject({action:'resync'});expect(kept[0].row!.publishable).toBe(true);
  const off=await planMethodologySync([method()],db,opts({unpublish:new Set(['sync_test@v1'])}));
  expect(off[0]).toMatchObject({action:'update',reason:'unpublished_by_script'});expect(off[0].row!.publishable).toBe(false);
  expect((await planMethodologySync([method(),method()],db,opts()))[1].problems).toContain('duplicate_in_registry');
  expect(await planMethodologySync([method()],db,opts({only:new Set(['other@v1'])}))).toEqual([]);
 });
 it('licenses.json (D3): the committed file covers exactly ORIGINS, all unverified; reachable keys follow input_kinds',()=>{
  const committed=validateLicenseTable(JSON.parse(readFileSync(join(process.cwd(),LICENSES_PATH),'utf8')));
  expect(Object.keys(committed).sort()).toEqual(Object.keys(ORIGINS).sort());
  expect(Object.values(committed).every(e=>e.status==='unverified'&&e.confirmed_by===null)).toBe(true);
  expect(reachableOriginKeys({input_kinds:['macro_snapshot','macro_observation']})).toEqual(['macro_observation×macro_workbench','macro_snapshot×macro_workbench']);
  expect(licenseProblems({input_kinds:['price_bar']},committed)).toEqual(['license_unconfirmed:price_bar×datagateway','license_unconfirmed:price_bar×eastmoney']);
  expect(()=>validateLicenseTable({...committed,'x×y':committed['judgment×judgments']})).toThrow(/unknown origin key/);
  expect(()=>validateLicenseTable({...committed,'judgment×judgments':{status:'confirmed',confirmed_by:null,confirmed_at:null,evidence:null}})).toThrow(/confirmed licence needs/);
  expect(validateMethodology(method({deps:[LICENSES_PATH]}),process.cwd())).toContain('licenses_in_deps');
 });
 it('validation: patterns, public kinds, window_years ≥ 3 × horizon, files, deps lint',()=>{
  expect(validateMethodology(method(),root,['src/lib/m/method.ts'])).toEqual([]);
  expect(validateMethodology(method({id:'Bad-Id',version:'1'}),root)).toEqual(expect.arrayContaining(['id_pattern','version_pattern']));
  expect(validateMethodology(method({producer_kind:'human',subject_types:['security'],input_kinds:['legacy_fill']}),root)).toEqual(expect.arrayContaining(['producer_kind_not_public:human','subject_type_not_public:security','input_kind_not_public:legacy_fill']));
  expect(validateMethodology(method({horizon:{unit:'fiscal_quarters',n:20}}),root)).toEqual(expect.arrayContaining([expect.stringMatching(/^window_years_too_short:3y<3x1840d$/)]));
  expect(validateMethodology(method({horizon:{unit:'fiscal_quarters',n:20},params:{grace_days:120,label_policy:'first_observed',window_years:16}}),root)).toEqual([]);
  expect(validateMethodology(method({params:{grace_days:0,label_policy:'x'}}),root)).toEqual(expect.arrayContaining(['grace_days','label_policy']));
  expect(validateMethodology(method({deps:['src/lib/m/method.ts','data/none.json'],doc:'docs/none.md'}),root,['src/lib/m/method.ts'])).toEqual(expect.arrayContaining(['dep_in_import_closure:src/lib/m/method.ts','dep_missing:data/none.json','doc_missing:docs/none.md']));
  expect(horizonCalendarDays({unit:'trading_sessions',n:60})).toBe(92);
  expect(horizonCalendarDays({unit:'calendar_months',n:3})).toBe(93);
 });
});

describe('methodology sync review fixes (Codex M-03..M-05)',()=>{
 it('M-03: licenses.json in the import closure or deps (any spelling) is refused',()=>{
  expect(validateMethodology(method({deps:['docs/../docs/./methodologies/licenses.json']}),process.cwd())).toContain('licenses_in_closure');
  expect(validateMethodology(method({deps:[]}),process.cwd(),['docs/methodologies/./licenses.json'])).toContain('licenses_in_closure');
  expect(validateMethodology(method({deps:[]}),process.cwd(),['src/lib/judgments/origins.ts'])).not.toContain('licenses_in_closure');
 });
 it('M-04: an already publishable method whose licence is no longer confirmed is unpublished (license_withdrawn)',async()=>{
  const db=memoryJudgmentsDb();
  const confirmed:LicenseTable={'macro_snapshot×macro_workbench':{status:'confirmed',confirmed_by:'owner',confirmed_at:'2026-11-20',evidence:'c'}};
  await applyMethodologySync(await planMethodologySync([method()],db,opts()),db);
  await applyMethodologySync(await planMethodologySync([method()],db,opts({publish:new Set(['sync_test@v1']),ownerConfirmation:'owner 2026-11-20: licensed',licenses:confirmed})),db);
  expect((await db.methodology('sync_test','v1'))?.publishable).toBe(true);
  const withdrawn=await planMethodologySync([method()],db,opts({licenses:{}}));
  expect(withdrawn[0]).toMatchObject({action:'update',reason:'license_withdrawn',problems:[]});
  expect(withdrawn[0].row!.publishable).toBe(false);
  await applyMethodologySync(withdrawn,db);
  expect((await db.methodology('sync_test','v1'))?.publishable).toBe(false);
  expect((await planMethodologySync([method()],db,opts({licenses:confirmed})))[0].row!.publishable).toBe(false);   // not silently re-published
 });
 it('M-05: unknown horizon unit or non-positive / non-integer n is invalid_horizon',()=>{
  for(const horizon of [{unit:'weeks',n:3},{unit:'calendar_days',n:0},{unit:'calendar_days',n:1.5},{unit:'calendar_days',n:Number.NaN},{unit:'calendar_days',n:Number.POSITIVE_INFINITY}])
   expect(validateMethodology(method({horizon:horizon as never}),root)).toContain('invalid_horizon');
  expect(validateMethodology(method({horizon:{unit:'calendar_months',n:0}}),root)).not.toContain('invalid_horizon');
  expect(horizonCalendarDays({unit:'weeks',n:3} as never)).toBeNaN();
 });
});
