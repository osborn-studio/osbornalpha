import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import {VIEW_IDS} from '@/lib/company/client';
import {ViewTabs,PRIMARY_VIEWS,SECONDARY_VIEWS} from './ViewTabs';
import en from '../../../messages/en/company.json';
import zh from '../../../messages/zh/company.json';
it('splits every view exactly once in the required order',()=>{
 expect(PRIMARY_VIEWS).toEqual(['overview','statements','metrics','filings','tracking','judgments']);
 expect(SECONDARY_VIEWS).toEqual(['ai','signals','holdings']);
 expect([...PRIMARY_VIEWS,...SECONDARY_VIEWS].sort()).toEqual([...VIEW_IDS].sort());
});
for(const locale of ['en','zh'] as const) for(const view of VIEW_IDS) it(`tabs ${locale} ${view}`,()=>{
 const messages=locale==='en'?en:zh;
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,messages:{company:messages},children:createElement(ViewTabs,{ticker:'TEST',view,asOf:'2025-01-01'})}));
 expect(html).not.toContain('aria-haspopup');
 expect(html).toContain('<ul');
 expect(html).toContain('aria-expanded="false"');
 expect(html).not.toContain('role="menu');
 expect(html.match(/<li>/g)).toHaveLength(3);
 expect(html.match(/aria-current="page"/g)).toHaveLength(1);
 expect(html).toContain('asOf=2025-01-01');
 if(['ai','signals','holdings'].includes(view)) expect(html).toContain(`${locale==='zh'?'更多':'More'} · ${messages.tabs[view]}`);
});
