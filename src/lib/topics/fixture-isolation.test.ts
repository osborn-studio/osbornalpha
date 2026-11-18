// Topic fixture bundle isolation (spec §9, §13.2).
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import ts from 'typescript';
it.each(['deps.ts','flags.ts','e2e-fixture.ts','public-route.ts'])('%s does not statically import fixtures',file=>{
 const source=readFileSync(`src/lib/topics/${file}`,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 for(const node of ast.statements){
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))
   expect(node.moduleSpecifier.text).not.toMatch(/^(?:\.\/fixtures|@\/lib\/topics\/fixtures)(?:\/|$)/);
 }
});
it('keeps the flag module import free',()=>{
 expect(readFileSync('src/lib/topics/e2e-fixture.ts','utf8')).not.toMatch(/^import\s/m);
});
it('fixes the fixture clock for reproducible pages',async()=>{
 const {fixtureDeps}=await import('./fixtures/deps');
 expect(fixtureDeps().now().toISOString()).toBe('2026-11-15T00:00:00.000Z');
 expect(fixtureDeps()).toBe(fixtureDeps());
});
