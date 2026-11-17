import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('./use-macro-t',()=>({useMacroT:()=>({locale:'en',t:(k:string,a?:{code?:string})=>a?.code??k})}));
import {CorrelationResult} from './CorrelationResult';
import type {PresetCard} from '@/lib/macro/preset-contract';
it('renders a named failed preset with its reason and no fabricated result',()=>{
 const run={preset_id:'p1',run_id:null,status:'failed',error:'restricted',created_at:'2026-11-01T00:00:00Z',inputs:{cutoff:'2026-11-01T00:00:00Z',catalog_version:'v',indicator:{observations:[]},asset:{observations:[]}},inputs_hash:'hash'} as unknown as PresetCard;
 const html=renderToStaticMarkup(createElement(CorrelationResult,{run,mode:'preset'}));
 expect(html).toContain('correlation.presetNames.p1');expect(html).toContain('restricted');expect(html).not.toContain('>null');expect(html).not.toContain('correlation.result.r2');
});
