// Source-level guards for D3 stock and consensus integration (spec §9.4).
import {readFileSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');

describe('D3 shared-file edits',()=>{
 it('stock pages do not use mock broker reports and CompanyPage mounts the library block',()=>{
  const root='src/app/(app)/stock/[ticker]';
  const files=(dir:string):string[]=>readdirSync(resolve(process.cwd(),dir),{withFileTypes:true}).flatMap(entry=>{
   const path=`${dir}/${entry.name}`;
   return entry.isDirectory()?files(path):/\.[jt]sx?$/.test(entry.name)?[path]:[];
  });
  for(const file of files(root)){
   const src=read(file);
   expect(src).not.toMatch(/@\/lib\/data\/mock[\s\S]*broker_reports|broker_reports[\s\S]*@\/lib\/data\/mock/);
  }
  expect(read(`${root}/CompanyPage.tsx`)).toContain('<LibraryReportsBlock ticker={ticker} />');
 });
 it('consensus route has no mock branch',()=>{
  const src=read('src/app/api/consensus/[ticker]/route.ts');
  expect(src).not.toContain('getStockOrStub');expect(src).not.toContain("source: 'mock'");
  expect(src).toMatch(/return NextResponse\.json\(\{ source: 'none', ticker, consensus: null \}\)/);
 });
 it('intel page links to the module',()=>{
  const src=read('src/app/(app)/intel/page.tsx');
  expect(src).toMatch(/\{\/\* FOREIGN ↓ \*\/\}\s*<ForeignEntryCard \/>\s*\{\/\* FOREIGN ↑ \*\/\}/);
  expect(read('src/app/(app)/intel/foreign-research/components/ForeignEntryCard.tsx')).toContain('href="/intel/foreign-research"');
 });
});
