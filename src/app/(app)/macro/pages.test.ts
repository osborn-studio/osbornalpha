// Structural guards for the macro pages (spec §2, §3.2, §3.5): force-dynamic server pages, judgment flag read only
// server-side, MACRO markers in shared files, TabBar segment-aware highlight.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const PAGES=['page.tsx','[seriesId]/page.tsx','analyses/[runId]/page.tsx'];
describe('macro pages',()=>{
 it('removes the former Today page and glance components',()=>{
  for(const path of ['src/app/(app)/today/page.tsx','src/components/today/BriefGlance.tsx','src/components/today/PortfolioGlance.tsx','src/components/today/RadarStream.tsx','src/components/today/MacroGlance.tsx']){
   expect(existsSync(join(process.cwd(),path)),path).toBe(false);
  }
 });
 for(const p of PAGES)it(`${p} is a force-dynamic server component`,()=>{
  const src=read(`src/app/(app)/macro/${p}`);
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
 });
 it('only the workbench server page reads MACRO_JUDGMENTS_ENABLED',()=>{
  expect(read('src/app/(app)/macro/page.tsx')).toContain('macroJudgmentsEnabled()');
  const files=(readdirSync(join(process.cwd(),'src/components/macro'),{recursive:true}) as string[]).filter(f=>/\.tsx?$/.test(f));
  for(const f of files)expect([f,read(`src/components/macro/${f}`).includes('MACRO_JUDGMENTS_ENABLED')]).toEqual([f,false]);
 });
 it('/intel mounts the macro summary card inside MACRO markers',()=>{
  const p=read('src/app/(app)/intel/page.tsx');
  expect(p).toMatch(/\/\/ MACRO\nimport \{ MacroSummaryCard \} from '@\/components\/macro\/MacroSummaryCard';\n\/\/ \/MACRO/);
  expect(p).toMatch(/\{\/\* MACRO \*\/\}[\s\S]*<MacroSummaryCard \/>[\s\S]*\{\/\* \/MACRO \*\/\}/);
 });
 it('TabBar highlights /macro/* with segment-aware matching',()=>{
  const tb=read('src/components/TabBar.tsx');
  expect(tb).toContain("href: '/macro'");
  expect(tb).toContain('const active = isTabActive(pathname, t.href);');
  expect(tb).not.toContain('pathname.startsWith(t.href)');
 });
});
