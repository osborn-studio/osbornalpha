import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import zh from '../../../messages/zh/research.json';
import en from '../../../messages/en/research.json';
import {ResearchFooter} from './ResearchFooter';
it.each(['zh','en'] as const)('deduplicates source chips and renders one disclaimer in %s',locale=>{
 const catalog=locale==='zh'?zh:en;
 const render=(empty=false,methodsHref?:string)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:catalog},children:createElement(ResearchFooter,{sources:empty?[]:[{publisher:'BLS',relay:'FRED'},{publisher:'SEC EDGAR'},{publisher:'BLS',relay:'FRED'},{publisher:'SEC EDGAR',relay:null}],methodsHref})}));
 const html=render();
 expect(html).toContain('data-research-footer');expect(html.split('BLS via FRED')).toHaveLength(2);expect(html.split('SEC EDGAR')).toHaveLength(2);
 expect(html.indexOf('BLS via FRED')).toBeLessThan(html.indexOf('SEC EDGAR'));
 const text=html.replace(/&#x27;/g,"'").replace(/<[^>]*>/g,'');
 expect(text.split(catalog.footer.disclaimer)).toHaveLength(2);expect(html).not.toContain('<a');
 const linked=render(false,'/intel/methods/a');expect(linked).toContain('href="/intel/methods/a"');expect(linked).toContain(catalog.footer.methods);
 const empty=render(true,'/intel/methods/a');expect(empty).not.toContain('<div');expect(empty).not.toContain('<a');
 expect(empty.replace(/&#x27;/g,"'").replace(/<[^>]*>/g,'')).toBe(catalog.footer.disclaimer);
});
