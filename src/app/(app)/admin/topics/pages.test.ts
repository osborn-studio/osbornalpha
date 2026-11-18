// Topic plan T5.4: every server page closes the flag before authentication.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {expect,it} from 'vitest';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';
const ROOT=join(process.cwd(),'src/app/(app)/admin/topics');
const pages=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?pages(p):f==='page.tsx'?[p]:[];});
it('provides list and creation pages',()=>{
 expect(pages(ROOT).map(p=>relative(ROOT,p))).toEqual(expect.arrayContaining(['page.tsx','new/page.tsx','[id]/page.tsx']));
});
it('gates every page before admin access and uses token colors',()=>{
 for(const p of pages(ROOT)){
  const src=readFileSync(p,'utf8');
  expect(src).not.toContain("'use client'");
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toMatch(/if\(!topicsEnabled\(\)\)notFound\(\)/);
  const gate=src.indexOf('await adminGate(');
  expect(gate).toBeGreaterThan(src.indexOf('if(!topicsEnabled())'));
  expect(src).toMatch(/if\(!user\)return <AdminDenied\/>/);
  expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
 }
});

it('keeps server validation out of every editor runtime import',()=>{
 const dir=join(process.cwd(),'src/components/topics/admin/editor');
 for(const name of readdirSync(dir).filter(n=>/\.tsx?$/.test(n)&&!n.endsWith('.test.ts')&&n!=='lint-field.ts')){
  const source=readFileSync(join(dir,name),'utf8');
  const runtime=transpileModule(source,{fileName:name,compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.Preserve}}).outputText;
  expect(runtime).not.toMatch(/from ['"][^'"]*(?:drafts|lexical|lint-field|admin-deps|evidence\/ref)['"]/);
 }
});
