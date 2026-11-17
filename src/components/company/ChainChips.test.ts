import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {afterEach,expect,it,vi} from 'vitest';
import {ChainChips} from './ChainChips';
import * as fetchHook from './useCompanyFetch';
import en from '../../../messages/en/company.json';
import zh from '../../../messages/zh/company.json';
import enResearch from '../../../messages/en/research.json';
import zhResearch from '../../../messages/zh/research.json';
afterEach(()=>vi.restoreAllMocks());
for(const locale of ['zh','en'] as const){
 it.each(['loading','error','withheld','missing','link'] as const)(`renders industry %s (${locale})`,kind=>{
  vi.spyOn(fetchHook,'useCompanyFetch').mockReturnValue({retry:()=>{},state:kind==='loading'?{status:'loading'}:kind==='error'?{status:'error',httpStatus:500,code:'internal'}:{status:'ok',data:{state:'ok',schemes:[{scheme:'sic',public:kind!=='withheld'}],industries:kind==='link'?[{scheme:'sic',path:[{code:'1234',nameZh:'行业',nameEn:'Industry'}]}]:[]}}});
  const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,messages:{company:locale==='en'?en:zh,research:locale==='en'?enResearch:zhResearch},children:createElement(ChainChips,{issuerId:'id',market:'US',ticker:'TEST',asOf:null,locale,foreignPublic:true})}));
  expect(html).toContain('data-testid="chain-chip-industry"');
  if(kind==='link') {expect(html).toContain('href="/intel/industries/sic/1234"');expect(html).toContain(locale==='zh'?'← 02 行业：':'← 02 Industry: ');}
  else expect(html).not.toContain('href="/intel/industries/');
  if(kind==='withheld'||kind==='missing') expect(html).toContain(`data-research-state="${kind}"`);
  if(kind==='error') {expect(html).toContain(locale==='zh'?'02 行业 · 读取失败':'02 Industry · lookup failed');expect(html).toContain('<button');expect(html).not.toContain('data-research-state');}
  if(kind==='loading') {expect(html).toContain('…');expect(html).not.toContain('animate-');}
 });
}
