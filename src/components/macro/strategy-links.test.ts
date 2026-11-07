// WP-S6 step 4: the three link tabs 传导 / 历史 / 复盘 on the P1 workbench exist only while MACRO_STRATEGY_ENABLED is on.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {STRATEGY_LINK_TABS,strategyLinkTabs} from './strategy-links';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');

describe('strategyLinkTabs',()=>{
 it('is empty while the strategy flag is off',()=>{expect(strategyLinkTabs(false)).toEqual([]);});
 it('lists transmission, history, review with their routes while on',()=>{
  expect(strategyLinkTabs(true)).toEqual([
   {key:'transmission',href:'/intel/macro/transmission'},{key:'history',href:'/intel/macro/history'},{key:'review',href:'/intel/macro/review'}]);
  expect(STRATEGY_LINK_TABS).toHaveLength(3);
 });
});

describe('workbench wiring (structural)',()=>{
 it('MacroWorkbench renders the link tabs inside a MACRO-P3 block, from a strategyEnabled prop',()=>{
  const src=read('src/components/macro/MacroWorkbench.tsx');
  expect(src).toMatch(/\{\/\* MACRO-P3 \*\/\}[\s\S]*strategyLinkTabs\(strategyEnabled\)[\s\S]*\{\/\* \/MACRO-P3 \*\/\}/);
  expect(src).toMatch(/\/\/ MACRO-P3\nimport \{ strategyLinkTabs \} from '.\/strategy-links';\n\/\/ \/MACRO-P3/);
  expect(src).toContain('strategyEnabled');
  expect(src).not.toContain('MACRO_STRATEGY_ENABLED');   // the flag is read server-side only
 });
 it('only the server page reads the flag, through the strategy flag helper',()=>{
  const page=read('src/app/(app)/intel/macro/page.tsx');
  expect(page).toMatch(/\/\/ MACRO-P3[\s\S]*strategyEnabled\(\)[\s\S]*\/\/ \/MACRO-P3/);
  expect(page).toContain('strategyEnabled=');
 });
 it('tab labels exist in both macro message files',()=>{
  for(const l of ['zh','en']){
   const tabs=JSON.parse(read(`messages/${l}/macro.json`)).tabs;
   for(const k of ['transmission','history','review'])expect(typeof tabs[k]).toBe('string');
  }
 });
});
