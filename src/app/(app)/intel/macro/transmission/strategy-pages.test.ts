// Structural guards for the four strategy pages (spec §3.1, §9.1): force-dynamic server components behind the
// (app) login gate; MACRO_STRATEGY_ENABLED off → notFound(); null port → the "foundation not ready" state before any
// data; environment flags read only through flags.ts (never in pages or components).
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const BASE='src/app/(app)/intel/macro';
const PAGES=['transmission/page.tsx','history/page.tsx','review/page.tsx','review/[region]/[month]/page.tsx'];
describe('macro strategy pages',()=>{
 for(const p of PAGES)it(`${p}: force-dynamic server page with the capability gates`,()=>{
  const src=read(`${BASE}/${p}`);
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toContain("import { strategyEnabled } from '@/lib/macro/strategy/flags';");
  expect(src).toMatch(/if \(!strategyEnabled\(\)\) notFound\(\);/);
  expect(src).toMatch(/if \(!strategyPort\(\)\) return <DependencyState kind="foundation" \/>;/);
  expect(src.indexOf('strategyEnabled()')).toBeLessThan(src.indexOf('strategyPort()'));
  expect(src).not.toContain('process.env');
 });
 it('the month page rejects an invalid region or month with notFound',()=>{
  const src=read(`${BASE}/review/[region]/[month]/page.tsx`);
  expect(src).toContain("(region !== 'US' && region !== 'CN')");
  expect(src).toContain('/^\\d{4}-(0[1-9]|1[0-2])$/');
 });
 it('strategy components never read the environment or server-only modules',()=>{
  const files=(readdirSync(join(process.cwd(),'src/components/macro/strategy'),{recursive:true}) as string[]).filter(f=>/\.tsx?$/.test(f)&&!f.endsWith('.test.ts'));
  expect(files.length).toBeGreaterThanOrEqual(15);
  for(const f of files){
   const src=read(`src/components/macro/strategy/${f}`);
   expect([f,src.includes('process.env')]).toEqual([f,false]);
   expect([f,/^import \{[^}]*\} from '@\/lib\/(supabase|macro\/strategy\/(port|db|flags|llm-deps|route-helpers|f4-client))/m.test(src)]).toEqual([f,false]);
  }
 });
});
