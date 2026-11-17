import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import zh from '../../../messages/zh/research.json';
import en from '../../../messages/en/research.json';
import {MarkCard} from './MarkCard';
import {MarkLegend} from './MarkLegend';
it.each(['zh','en'] as const)('distinguishes fact, judgment and hypothesis in %s',locale=>{
 const catalog=locale==='zh'?zh:en;
 const render=(children:React.ReactNode)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:catalog},children}));
 for(const title of [undefined,'Title']){
  const fact=render(createElement(MarkCard,{kind:'fact',title,children:'Body'}));
  expect(fact).toContain('data-mark="fact"');expect(fact).not.toContain(catalog.marks.judgment);expect(fact).not.toContain(catalog.marks.hypothesis);
  expect(fact).not.toContain('border-dashed');expect(fact).not.toContain('border-active');expect(fact).not.toContain(catalog.marks.fact);
 }
 const judgment=render(createElement(MarkCard,{kind:'judgment',children:'Body'}));
 expect(judgment).toContain('border-[var(--border-active)]');expect(judgment).toContain(catalog.marks.judgment);
 const hypothesis=render(createElement(MarkCard,{kind:'hypothesis',children:'Body'}));
 expect(hypothesis).toContain('border-dashed');expect(hypothesis).toContain(catalog.marks.hypothesis);
 expect(render(createElement(MarkCard,{kind:'judgment',institution:'BLS',children:'Body'}))).toContain(catalog.marks.thirdParty.replace('{institution}','BLS'));
 const legend=render(createElement(MarkLegend));
 expect(legend).toContain('role="group"');
 const indices=['fact','judgment','hypothesis'].map(k=>legend.indexOf(catalog.marks[k as 'fact']));
 expect(indices[0]).toBeGreaterThan(-1);expect(indices[0]).toBeLessThan(indices[1]);expect(indices[1]).toBeLessThan(indices[2]);
});
