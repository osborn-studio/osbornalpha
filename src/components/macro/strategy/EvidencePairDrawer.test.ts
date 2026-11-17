import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {EvidencePairDrawer} from './EvidencePairDrawer';
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k,useLocale:()=> 'en'}));
it('keeps pair/ref content in the shared six-section shell and hides it when closed',()=>{
 const props={open:true,title:'Frozen pair',onClose:()=>{},children:React.createElement('table',null,React.createElement('caption',null,'Retained refs'))};
 const html=renderToStaticMarkup(React.createElement(EvidencePairDrawer,props));
 expect(html).toContain('data-drawer-section="transform"');expect(html).toContain('Retained refs');expect(html).toContain('Frozen pair');
 expect(renderToStaticMarkup(React.createElement(EvidencePairDrawer,{...props,open:false}))).toBe('');
});
