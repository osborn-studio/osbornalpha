import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import foreign from '../../../../../../messages/zh/foreign-research.json';
import research from '../../../../../../messages/zh/research.json';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import {InstitutionsClient} from './InstitutionsClient';
it('renders an institution summary table and selected append-only editor with labelled controls',()=>{
 const html=renderToStaticMarkup(React.createElement(NextIntlClientProvider,{locale:'zh',messages:{'foreign-research':foreign,research},children:React.createElement(InstitutionsClient,{details:[{institution:{institution_id:'i',name_en:'Broker',name_zh:null,aliases:[]},scales:[],analysts:[]}]})}));
 for(const label of ['机构','评级量表','分析师','报告','许可','编辑','保存映射'])expect(html).toContain(label);
 expect(html).toContain('data-institution-editor');expect(html).toContain('overflow-x-auto');expect(html).toContain('未提供');
 expect(html).not.toContain('已登记');
});
