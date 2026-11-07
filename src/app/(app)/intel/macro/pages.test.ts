// Structural guards for the macro pages (spec §2, §3.2, §3.5): force-dynamic server pages, judgment flag read only
// server-side, no mock data in Today/macro components, MACRO markers in shared files, TabBar prefix highlight.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const PAGES=['page.tsx','[seriesId]/page.tsx','analyses/[runId]/page.tsx'];
describe('macro pages',()=>{
 for(const p of PAGES)it(`${p} is a force-dynamic server component`,()=>{
  const src=read(`src/app/(app)/intel/macro/${p}`);
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
 });
 it('only the workbench server page reads MACRO_JUDGMENTS_ENABLED',()=>{
  expect(read('src/app/(app)/intel/macro/page.tsx')).toContain('macroJudgmentsEnabled()');
  const files=(readdirSync(join(process.cwd(),'src/components/macro'),{recursive:true}) as string[]).filter(f=>/\.tsx?$/.test(f));
  for(const f of files)expect([f,read(`src/components/macro/${f}`).includes('MACRO_JUDGMENTS_ENABLED')]).toEqual([f,false]);
 });
 it('Today glance has no mock rows and sits inside MACRO markers',()=>{
  const g=read('src/components/today/MacroGlance.tsx');
  expect(g).not.toMatch(/MOCK_DATA|@\/lib\/data\/mock/);
  expect(g).toMatch(/^\/\/ MACRO/m);expect(g).toMatch(/^\/\/ \/MACRO/m);
 });
 it('/intel mounts the macro summary card inside MACRO markers',()=>{
  const p=read('src/app/(app)/intel/page.tsx');
  expect(p).toMatch(/\/\/ MACRO\nimport \{ MacroSummaryCard \} from '@\/components\/macro\/MacroSummaryCard';\n\/\/ \/MACRO/);
  expect(p).toMatch(/\{\/\* MACRO \*\/\}[\s\S]*<MacroSummaryCard \/>[\s\S]*\{\/\* \/MACRO \*\/\}/);
 });
 it('TabBar highlights /intel/macro/* through the /intel prefix',()=>{
  const tb=read('src/components/TabBar.tsx');
  expect(tb).toContain("href: '/intel'");expect(tb).toContain('pathname.startsWith(t.href)');
 });
});
