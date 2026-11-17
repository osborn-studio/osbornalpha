import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';

const root=process.cwd();
const broker=path.join(root,'src/lib/broker-research');
const forbidden=new Set(['public-read.ts','db.ts','pg-db.ts','admin-read.ts','admin-document.ts','deps.ts','preview.ts'].map(file=>path.join(broker,file)));
const entities=path.join(root,'src/lib/entities');
const options:ts.CompilerOptions={moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:root,paths:{'@/*':['src/*']},allowJs:true};
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const file=path.join(dir,entry.name);
 return entry.isDirectory()?files(file):/\.[jt]sx?$/.test(file)?[file]:[];
});
const source=(file:string)=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
const clients=['src/app/(app)/intel/foreign-research','src/app/(app)/stock','src/app/(app)/admin/broker-research'].flatMap(dir=>files(path.join(root,dir)))
 .filter(file=>source(file).statements.some(node=>ts.isExpressionStatement(node)&&ts.isStringLiteral(node.expression)&&node.expression.text==='use client'));

it('finds client components in all guarded routes',()=>{
 for(const route of ['/intel/foreign-research/','/stock/','/admin/broker-research/'])expect(clients.some(file=>file.includes(route))).toBe(true);
});

for(const client of clients)it(`${path.relative(root,client)} keeps broker research server dependencies out of the client graph`,()=>{
 const seen=new Set<string>();
 const violations:string[]=[];
 function visit(file:string,chain:string[]){
  if(forbidden.has(file)||file.startsWith(`${entities}${path.sep}`)){
   violations.push([...chain,file].map(part=>path.relative(root,part)).join(' -> '));return;
  }
  if(seen.has(file))return;
  seen.add(file);
  function dependency(specifier:string,typeOnly=false){
   if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))return;
   const target=ts.resolveModuleName(specifier,file,options,ts.sys).resolvedModule?.resolvedFileName;
   if(!target||!target.startsWith(path.join(root,'src')+path.sep))return;
   // Other features may reference server DTOs with erased type imports. Broker
   // research types must still come from its explicitly client-safe modules.
   if(typeOnly&&!target.startsWith(broker+path.sep))return;
   visit(target,[...chain,file]);
  }
  function walk(node:ts.Node){
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text,node.importClause?.isTypeOnly);
   if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text,node.isTypeOnly);
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))){
    const arg=node.arguments[0];if(arg&&ts.isStringLiteral(arg))dependency(arg.text);
   }
   ts.forEachChild(node,walk);
  }
  walk(source(file));
 }
 visit(client,[]);
 expect(violations).toEqual([]);
});
