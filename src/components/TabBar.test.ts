import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

describe('macro navigation',()=>{
 it('uses macro as the first tab and segment-aware active check',()=>{
  const source=read('src/components/TabBar.tsx');
  expect(source).toMatch(/const TABS: TabDef\[\] = \[\s*\{\s*id: 'macro', navKey: 'macro', href: '\/macro'/);
  expect(source).not.toContain('/today');
  expect(source).toContain('const active = isTabActive(pathname, t.href);');
  expect(source).not.toContain('pathname.startsWith(t.href)');
 });
 it.each(['zh','en'])('%s common messages name macro and omit today',locale=>{
  const {nav}=JSON.parse(read(`messages/${locale}/common.json`));
  expect(nav.macro).toBe(locale==='zh'?'宏观':'Macro');
  expect(nav).not.toHaveProperty('today');
  expect(Object.keys(nav)[0]).toBe('macro');
 });
});
