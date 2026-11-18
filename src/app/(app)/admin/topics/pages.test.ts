// Topic plan T5.4: every server page closes the flag before authentication.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {expect,it} from 'vitest';
const ROOT=join(process.cwd(),'src/app/(app)/admin/topics');
const pages=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?pages(p):f==='page.tsx'?[p]:[];});
it('provides list and creation pages',()=>{
 expect(pages(ROOT).map(p=>relative(ROOT,p))).toEqual(expect.arrayContaining(['page.tsx','new/page.tsx']));
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
