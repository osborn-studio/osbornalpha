import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
import {MacroTabs} from '@/components/macro/MacroTabs';
import MacroLayout from './layout';

vi.mock('../../../components/macro/use-macro-t',()=>({useMacroT:()=>({t:(k:string)=>k,locale:'en'})}));
afterEach(()=>vi.unstubAllEnvs());

it.each([['1',7],[undefined,4],['true',4]] as const)('renders the tab row for MACRO_STRATEGY_ENABLED=%s',(value,count)=>{
 vi.stubEnv('MACRO_STRATEGY_ENABLED',value);
 const html=renderToStaticMarkup(React.createElement(MacroLayout,{children:React.createElement(MacroTabs,{active:'overview'})}));
 expect(html.match(/<a /g)).toHaveLength(count);
});
