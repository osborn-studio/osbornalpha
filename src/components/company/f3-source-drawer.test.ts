import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import company from '../../../messages/en/company.json';
import research from '../../../messages/en/research.json';
import {SourceDrawerAdapter} from './f3-source-drawer';
const mock=vi.hoisted(()=>({binding:{status:'loading'} as unknown,detail:{status:'loading'} as unknown}));
vi.mock('./useCompanyFetch',()=>({useCompanyFetch:(url:string|null)=>({state:url?.includes('by-filing')?mock.binding:url?.includes('/doc/')?mock.detail:{status:'idle'},retry:()=>{}})}));
const render=(originalUrl:string|null='https://example.org/source.pdf')=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{company,research},children:createElement(SourceDrawerAdapter,{ticker:'AAPL',filingId:'filing',onClose:()=>{},originalUrl})}));
it('pending binding shows shared pending sections',()=>{mock.binding={status:'loading'};const html=render();expect(html).toContain('aria-busy="true"');expect(html).toContain('data-drawer-section="source"');});
it.each([['not_found','notFound'],['ambiguous','ambiguous']] as const)('unresolved %s shows the existing failure text in the shared frame', (reason,key)=>{mock.binding={status:'ok',data:{document:null,reason}};const html=render();expect(html).toContain(company.sourceDrawer[key]);expect(html).toContain('role="alert"');expect(html).toContain('filing');});
it('restricted binding exposes identity and the original action but no provenance sections',()=>{mock.binding={status:'ok',data:{document:null,reason:'restricted'}};const html=render();expect(html).toContain('data-research-state="withheld"');expect(html).toContain(company.sourceDrawer.restricted);expect(html).toContain('https://example.org/source.pdf#page=1');expect(html).not.toContain('data-drawer-section="source"');});
it('corrupt detail fails without exposing mismatched document metadata',()=>{mock.binding={status:'ok',data:{document:{documentId:'bound'}}};mock.detail={status:'ok',data:{document:{documentId:'wrong',title:'UNVERIFIED'}}};const html=render();expect(html).toContain(company.sourceDrawer.loadFailed);expect(html).not.toContain('UNVERIFIED');});

it('keeps signed download visible on mobile even when there is no original link',()=>{
 const document={documentId:'doc',issuerId:'i',source:'cninfo',sourceRef:'ref',sourceVersion:1,availableDate:'2025-01-01',currentExtractionId:null};
 mock.binding={status:'ok',data:{document}};
 mock.detail={status:'ok',data:{document:{...document,title:'Report',sourceUrl:null,status:'stored',publishedAt:'2025-01-01',availableAt:'2025-01-01'},extractions:{rows:[]}}};
 const html=render(null);
 const identity=html.split('data-drawer-section="identity"')[1].split('</section>')[0];
 expect(identity).toContain('sm:hidden');expect(identity).toContain(company.sourceDrawer.download);
});
