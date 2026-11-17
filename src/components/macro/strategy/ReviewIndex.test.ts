import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import messages from '../../../../messages/en/macroStrategy.json';
import {ReviewIndex} from './ReviewIndex';
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k}));
vi.mock('./use-strategy-t',()=>({useStrategyT:()=>({locale:'en',t:(key:string)=>key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],messages)})}));
it('keeps insufficient review wording as the link text and none as a workflow state',()=>{
 const html=renderToStaticMarkup(createElement(ReviewIndex,{months:['2026-10'],us:[],cn:[{region:'CN',month:'2026-10',status:'insufficient',generation:1,result_id:'r',updated_at:''}]}));
 expect(html).toMatch(/<a[^>]*href="\/macro\/review\/CN\/2026-10"[^>]*>Insufficient data<\/a>/);
 expect(html).not.toContain('data-research-state');
});
