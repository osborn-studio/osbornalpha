// Source-level guards for D3 shared-file wiring (spec §9.4).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');

describe('D3 shared-file edits',()=>{
 it('stock page no longer reads mock broker reports and mounts the library block',()=>{
  const src=read('src/app/(app)/stock/[ticker]/page.tsx');
  expect(src).not.toContain('broker_reports');expect(src).not.toContain('hasBrokerReports');
  expect(src).toContain('<LibraryReportsBlock ticker={ticker} />');expect(src).toMatch(/\/\/ FOREIGN ↓[\s\S]*\/\/ FOREIGN ↑/);
 });
 it('consensus route has no mock branch',()=>{
  const src=read('src/app/api/consensus/[ticker]/route.ts');
  expect(src).not.toContain('getStockOrStub');expect(src).not.toContain("source: 'mock'");expect(src).toContain('FOREIGN');
 });
 it('intel page links to the module',()=>{
  const src=read('src/app/(app)/intel/page.tsx');
  expect(src).toContain('href="/intel/foreign-research"');expect(src).toMatch(/FOREIGN ↓[\s\S]*foreign-research[\s\S]*FOREIGN ↑/);
 });
});
