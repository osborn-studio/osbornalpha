// Public page rendering and no-mock constraints (spec §9.1).
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
const ROOT=join(process.cwd(),'src/app/(app)/intel/foreign-research');
const files=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?files(p):[p];});
const importsOf=(src:string)=>{
 const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
 return [...code.matchAll(/(?:^|[;\n])\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>m[1]??m[2]??m[3]);
};
const MOCK=/^@\/lib\/data\/mock(?:$|\/)|(?:^|\/)lib\/data\/mock$/;
describe('foreign research pages',()=>{
 for(const rel of ['page.tsx','[reportId]/page.tsx','institutions/[institutionId]/page.tsx'])it(`${rel} is dynamic server rendering`,()=>{const s=readFileSync(join(ROOT,rel),'utf8');expect(s).not.toContain("'use client'");expect(s).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);});
 it('does not import mock data',()=>{for(const f of files(ROOT).filter(f=>/\.tsx?$/.test(f)&&!/\.test\.tsx?$/.test(f)))expect(importsOf(readFileSync(f,'utf8')).filter(s=>MOCK.test(s)),f).toEqual([]);});
 it('detects direct and dynamic imports but ignores comments and strings',()=>{
  expect(importsOf("import {x} from '@/lib/data/mock';").filter(s=>MOCK.test(s))).toEqual(['@/lib/data/mock']);
  expect(importsOf('const x=await import("@/lib/data/mock");').filter(s=>MOCK.test(s))).toEqual(['@/lib/data/mock']);
  expect(importsOf("// import x from '@/lib/data/mock'\nconst s=\"@/lib/data/mock\";").filter(s=>MOCK.test(s))).toEqual([]);
 });
});
