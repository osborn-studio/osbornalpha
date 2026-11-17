import {expect,it} from 'vitest';
import {fixtureStylesheet} from '../../../tests/macro-source-integration/stylesheet';

it('emits the shared drawer viewport sizing and body scrolling utilities in the fixture CSS',async()=>{
 const css=await fixtureStylesheet(process.cwd());
 const declarations=new Map<string,string>();
 css.root.walkRules(rule=>{declarations.set(rule.selector,rule.toString());});
 for(const [selector,property] of [
  ['.fixed','position: fixed'],['.inset-0','inset: 0px'],
  ['.h-\\[100dvh\\]','height: 100dvh'],['.sm\\:h-full','height: 100%'],
  ['.min-h-0','min-height: 0px'],['.flex-1','flex: 1 1 0%'],
  ['.overflow-y-auto','overflow-y: auto'],['.shrink-0','flex-shrink: 0'],
 ]) expect(declarations.get(selector),selector).toContain(property);
});
