// Structural guards for the four strategy pages (spec §3.1, §9.1): force-dynamic server components behind the
// (app) login gate; MACRO_STRATEGY_ENABLED off → notFound(); null port → the "foundation not ready" state before any
// data; environment flags read only through flags.ts (never in pages or components).
import {readFileSync,readdirSync} from 'node:fs';
import {join,posix} from 'node:path';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const BASE='src/app/(app)/macro';
const PAGES=['transmission/page.tsx','history/page.tsx','review/page.tsx','review/[region]/[month]/page.tsx'];
const STRATEGY='src/components/macro/strategy';
const importsOf=(src:string)=>{
 const imports:string[]=[];
 const visit=(node:ts.Node)=>{
  if(ts.isImportDeclaration(node)){
   const clause=node.importClause,bindings=clause?.namedBindings;
   const erased=clause?.isTypeOnly||(!clause?.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length>0&&bindings.elements.every(e=>e.isTypeOnly));
   if(!erased&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
   return;
  }
  if(ts.isExportDeclaration(node)){
   const erased=node.isTypeOnly||(node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.length>0&&node.exportClause.elements.every(e=>e.isTypeOnly));
   if(!erased&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
   return;
  }
  if(ts.isImportEqualsDeclaration(node)&&!node.isTypeOnly&&ts.isExternalModuleReference(node.moduleReference)&&node.moduleReference.expression&&ts.isStringLiteral(node.moduleReference.expression))imports.push(node.moduleReference.expression.text);
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))imports.push(node.arguments[0].text);
  ts.forEachChild(node,visit);
 };
 visit(ts.createSourceFile('component.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX));
 return imports;
};
const forbiddenImport=(name:string,file=`${STRATEGY}/use-strategy-fetch.ts`)=>{
 const path=name.startsWith('.')?posix.normalize(posix.join(posix.dirname(file),name)):name.replace(/^@\//,'src/');
 // Only this browser entry point is permitted; server/admin/anon and barrels stay forbidden.
 if(path==='src/lib/supabase/client')return false;
 return /^(src\/lib\/supabase(?:\/|$)|src\/lib\/macro\/strategy\/(port|db|flags|llm-deps|route-helpers|f4-client)(?:[./]|$)|server-only$|next\/(headers|server)$|node:)/.test(path);
};
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
   expect([f,importsOf(src).filter(name=>forbiddenImport(name,`${STRATEGY}/${f}`))]).toEqual([f,[]]);
  }
 });
 it('allows browser auth while rejecting privileged imports regardless of import syntax',()=>{
  expect(forbiddenImport('@/lib/supabase/client')).toBe(false);
  expect(forbiddenImport('../../../lib/supabase/client')).toBe(false);
  expect(importsOf("import type {DeviationCasesDto} from '@/lib/macro/strategy/route-helpers';")).toEqual([]);
  expect(importsOf("import {type DeviationCasesDto} from '@/lib/macro/strategy/route-helpers';")).toEqual([]);
  for(const name of ['@/lib/supabase','@/lib/supabase/server','@/lib/supabase/admin','@/lib/supabase/anon','../../../lib/supabase/admin','@/lib/macro/strategy/port','@/lib/macro/strategy/db','@/lib/macro/strategy/flags','@/lib/macro/strategy/llm-deps','@/lib/macro/strategy/route-helpers','@/lib/macro/strategy/f4-client','server-only','next/headers','node:fs']){
   for(const source of [`import client from '${name}';`,`import * as client from "${name}";`,`import {\n client\n} from '${name}';`,`import {} from '${name}';`,`import '${name}';`,`export {client} from '${name}';`,`const client=import('${name}');`,`const client=require('${name}');`]){
    expect(importsOf(source).filter(name=>forbiddenImport(name)),source).toEqual([name]);
   }
  }
 });
 it('the auth listener uses the client boundary with only public config and safe imports',()=>{
  const hook=read(`${STRATEGY}/use-strategy-fetch.ts`);
  expect(hook).toContain("import {getBrowserSupabase} from '@/lib/supabase/client';");
  expect(hook).toContain('getBrowserSupabase().auth.onAuthStateChange(');
  const source=ts.createSourceFile('client.ts',read('src/lib/supabase/client.ts'),ts.ScriptTarget.Latest,true);
  expect(source.statements[0].getText(source)).toMatch(/^['"]use client['"];?$/);
  const imports=source.statements.filter(ts.isImportDeclaration);
  expect(imports.filter(s=>!s.importClause?.isTypeOnly).map(s=>s.moduleSpecifier.getText(source))).toEqual(["'@supabase/ssr'"]);
  expect(imports.filter(s=>s.importClause?.isTypeOnly).map(s=>s.moduleSpecifier.getText(source))).toEqual(["'./database.types'"]);
  expect(importsOf(source.text)).toEqual(['@supabase/ssr']);
  expect(source.text).toContain('createBrowserClient<Database>(');
  const publicConfig=new Set(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  let envReads=0;
  const visit=(node:ts.Node)=>{
   if(ts.isIdentifier(node)&&node.text==='process'){
    // Reject computed access, destructuring and whole-env reads as well as private keys.
    const env=node.parent,key=env.parent;
    expect(ts.isPropertyAccessExpression(env)&&env.name.text==='env').toBe(true);
    expect(ts.isPropertyAccessExpression(key)&&publicConfig.has(key.name.text)).toBe(true);
    envReads++;
   }
   ts.forEachChild(node,visit);
  };
  visit(source);
  expect(envReads).toBeGreaterThanOrEqual(2);
 });
});
