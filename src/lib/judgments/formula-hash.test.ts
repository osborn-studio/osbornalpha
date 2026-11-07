// src/lib/judgments/formula-hash.test.ts
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {depsSha256,formulaHashOf,implementationSha256,importClosure,importSpecifiers} from './formula-hash';
import type {Methodology} from './types';

let root:string;
const put=(rel:string,text:string)=>{mkdirSync(dirname(join(root,rel)),{recursive:true});writeFileSync(join(root,rel),text);};
const method=(o:Partial<Methodology>={}):Methodology=>({id:'fh_test',version:'v1',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',subject_types:['macro_region'],input_kinds:['macro_snapshot'],title:{zh:'测试',en:'test'},doc:'docs/m.md',params:{grace_days:30,label_policy:'cutoff_vintage'},horizon:{unit:'calendar_months',n:3},deps:['data/rules.json'],module:'src/lib/x/method.ts',status:'draft',
 gather:async()=>[],resolveTarget:async()=>({kind:'period',period:'2026-01'}),compute:()=>({abstained:true,reason:'test'}),condition:()=>{throw new Error('unused');},...o});
beforeAll(()=>{
 root=mkdtempSync(join(tmpdir(),'f4-formula-hash-'));
 put('src/lib/x/method.ts',[
  "import {a} from './a';",
  "import type {T} from '@/lib/y/types';",
  "export * from '../z/re';",
  "import d from './dir';",
  "// import {nope} from './commented';",
  "const s=\"import('./in-string')\";",
  "export const lazy=()=>import('./lazy');",
  "import fs from 'node:fs';",
  "export const m=(t:T)=>[a,d,s,fs,t];",
 ].join('\n'));
 put('src/lib/x/a.ts',"import {b} from './b.js';\nexport const a=b;\n");
 put('src/lib/x/b.ts','export const b=1;\n');
 put('src/lib/x/dir/index.ts','export default 2;\n');
 put('src/lib/x/lazy.ts','export const l=3;\n');
 put('src/lib/y/types.ts','export type T=number;\n');
 put('src/lib/z/re.ts',"export {cfg} from './cfg.json';\n");
 put('src/lib/z/cfg.json','{"cfg":1}\n');
 put('src/lib/unrelated.ts','export const u=0;\n');
 put('data/rules.json','{"rule":1}\n');
 put('docs/m.md','# m\n');
});
afterAll(()=>{rmSync(root,{recursive:true,force:true});});

describe('formula_hash (spec §4.1, audit G20)',()=>{
 it('importSpecifiers is a scanner: comments and strings are not imports; dynamic import and export-from are',()=>{
  expect(importSpecifiers("// import x from './c'\nconst s='import(\"./s\")';\nexport * from './e';\nconst l=()=>import('./l');\nimport type {T} from './t';").sort()).toEqual(['./e','./l','./t']);
 });
 it('the closure follows relative and @/ imports (type-only, export-from, dynamic, .js→.ts, dir/index, json) and stops at packages',()=>{
  expect(importClosure(root,'src/lib/x/method.ts')).toEqual(['src/lib/x/a.ts','src/lib/x/b.ts','src/lib/x/dir/index.ts','src/lib/x/lazy.ts','src/lib/x/method.ts','src/lib/y/types.ts','src/lib/z/cfg.json','src/lib/z/re.ts']);
 });
 it('implementation hash changes with any closure file, not with unrelated files; deps hash covers listed data files',()=>{
  const h0=implementationSha256(root,'src/lib/x/method.ts').sha256;
  put('src/lib/unrelated.ts','export const u=1;\n');
  expect(implementationSha256(root,'src/lib/x/method.ts').sha256).toBe(h0);
  put('src/lib/x/b.ts','export const b=2;\n');
  expect(implementationSha256(root,'src/lib/x/method.ts').sha256).not.toBe(h0);
  put('src/lib/x/b.ts','export const b=1;\n');
  expect(implementationSha256(root,'src/lib/x/method.ts').sha256).toBe(h0);
  const d0=depsSha256(root,['data/rules.json']);
  expect(depsSha256(root,['data/rules.json','data/rules.json'])).toBe(d0);
  put('data/rules.json','{"rule":2}\n');
  expect(depsSha256(root,['data/rules.json'])).not.toBe(d0);
  put('data/rules.json','{"rule":1}\n');
  expect(()=>depsSha256(root,['data/missing.json'])).toThrow(/formula_hash_missing_dep/);
 });
 it('formula_hash covers params, horizon, upstream, doc, implementation and deps; unresolved imports fail loudly',()=>{
  const a=formulaHashOf(method(),root);
  expect(a.formula_hash).toMatch(/^[0-9a-f]{64}$/);expect(a.closure).toContain('src/lib/x/b.ts');
  expect(formulaHashOf(method(),root).formula_hash).toBe(a.formula_hash);
  expect(formulaHashOf(method({params:{grace_days:31,label_policy:'cutoff_vintage'}}),root).formula_hash).not.toBe(a.formula_hash);
  expect(formulaHashOf(method({horizon:{unit:'calendar_months',n:4}}),root).formula_hash).not.toBe(a.formula_hash);
  expect(formulaHashOf(method({upstream:{macro_methodology_version:'v1.0'}}),root).formula_hash).not.toBe(a.formula_hash);
  expect(formulaHashOf(method({status:'active'}),root).formula_hash).toBe(a.formula_hash);   // status is not part of the formula
  put('docs/m.md','# m (edited)\n');
  expect(formulaHashOf(method(),root).formula_hash).not.toBe(a.formula_hash);
  put('docs/m.md','# m\n');
  put('src/lib/x/broken.ts',"import {q} from './missing';\nexport const z=q;\n");
  expect(()=>importClosure(root,'src/lib/x/broken.ts')).toThrow(/formula_hash_unresolved_import:src\/lib\/x\/broken\.ts:\.\/missing/);
  expect(()=>formulaHashOf(method({doc:'docs/none.md'}),root)).toThrow(/formula_hash_missing_doc/);
 });
});
