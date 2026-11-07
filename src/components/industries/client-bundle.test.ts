// src/components/industries/client-bundle.test.ts
// Codex plan audit round 1 #1: Next bundles the static import graph of every 'use client' module for the
// browser, so none may reach a node: builtin (node:crypto via method.ts → canonical-json.ts was the defect).
// Walks every client module of the industry UI (components + industry pages) through relative and '@/'
// imports; `import type` is skipped (erased). Task 19/20 add client modules: this test covers them too.
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SRC=join(ROOT,'src');
const ROOTS=['src/components/industries','src/app/(app)/intel/industries'].map(d=>join(ROOT,d));
const NODE=/^(node:|fs$|path$|crypto$|zlib$|child_process$|pg$)/;
function sources(d:string):string[]{
 if(!existsSync(d))return [];
 return readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?sources(p):/\.tsx?$/.test(n)&&!/\.test\.tsx?$/.test(n)?[p]:[];});
}
function specifiers(src:string):string[]{
 const out:string[]=[];
 for(const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s*['"]([^'"]+)['"]/gm))if(!m[1])out.push(m[2]);
 for(const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm))out.push(m[1]);
 return out;
}
function resolveSpec(from:string,spec:string):string|null{
 const base=spec.startsWith('@/')?join(SRC,spec.slice(2)):spec.startsWith('.')?resolve(dirname(from),spec):null;
 if(base===null)return null;
 for(const ext of ['.ts','.tsx','/index.ts','/index.tsx'])if(existsSync(base+ext))return base+ext;
 return null;
}
/** Every import chain from `entry` that ends in a node builtin. */
function nodeChains(entry:string):string[]{
 const bad:string[]=[];const seen=new Set<string>();const stack:[string,string[]][]=[[entry,[entry]]];
 while(stack.length){
  const [file,path]=stack.pop()!;
  if(seen.has(file))continue;seen.add(file);
  for(const spec of specifiers(readFileSync(file,'utf8'))){
   if(NODE.test(spec)){bad.push([...path.map(p=>p.slice(ROOT.length)),spec].join(' > '));continue;}
   const next=resolveSpec(file,spec);
   if(next)stack.push([next,[...path,next]]);
  }
 }
 return bad;
}

describe('client bundle guard',()=>{
 it("no 'use client' module of the industry UI reaches a node: builtin",()=>{
  const clients=ROOTS.flatMap(sources).filter(f=>/^\s*['"]use client['"]/.test(readFileSync(f,'utf8')));
  expect(clients.length).toBeGreaterThan(0);
  expect(clients.flatMap(nodeChains)).toEqual([]);
 });
 it('display.ts and method-constants.ts are browser-safe',()=>{
  expect(nodeChains(join(SRC,'lib/industry/display.ts'))).toEqual([]);
  expect(readFileSync(join(SRC,'lib/industry/method-constants.ts'),'utf8')).not.toMatch(/^\s*import\s/m);
 });
 it('the walker does see a node import (method.ts reaches node:crypto through canonical-json.ts)',()=>{
  expect(nodeChains(join(SRC,'lib/industry/method.ts')).some(c=>c.endsWith('node:crypto'))).toBe(true);
 });
});
