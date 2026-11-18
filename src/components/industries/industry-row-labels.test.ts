import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import zh from '../../../messages/zh/industries.json';
import en from '../../../messages/en/industries.json';
import {industries} from '../../../e2e/fixtures/company';
import {IndustryRowView} from './IndustryRow';

for(const [locale,label,hint] of [
 ['zh','仅当前值','SEC 只提供当前 SIC，没有纳入/剔除历史'],
 ['en','Current only','SEC provides only the current SIC code; no membership history'],
] as const) it(`labels the current SIC badge and explains its history (${locale})`,()=>{
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{industries:locale==='zh'?zh:en},
  children:createElement(IndustryRowView,{ticker:'FIXT',data:industries}),
 }));
 expect(html).not.toContain('current_only');
 expect(html).toMatch(new RegExp(`<span\\b[^>]* title="${hint}"[^>]*>${label}</span>`));
});
