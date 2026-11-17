import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {ExplanationPanel} from './ExplanationPanel';
const state=vi.hoisted(()=>({value:'accepted'}));
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k}));
vi.mock('./use-strategy-t',()=>({useStrategyT:()=>({locale:'en',t:(k:string)=>k})}));
vi.mock('./use-strategy-fetch',()=>({useStrategyFetch:()=>({state:{kind:'ok',data:{items:[{subject_id:'s',subject_kind:'snapshot',explanation_id:'e',provider:null,model:null,prompt_version:'p',validator_version:'v',state:state.value,locale:'en',manifest_id:'m',created_at:'2026-11-01',failure_codes:['invalid'],rendered:{facts:[{fact_id:'f',text:'Observed fact'}],hypotheses:[{text:'Model hypothesis',fact_ids:['f']}],counterpoints:[]}}]}},reload:()=>{}})}));
it.each(['accepted','failed','rejected'])('%s keeps facts zone and gates hypothesis zone',status=>{
 state.value=status;
 const html=renderToStaticMarkup(React.createElement(ExplanationPanel,{subject:{kind:'snapshot',id:'s'}}));
 expect(html).toContain('data-mark="fact"');
 expect(html).toContain(`explain.state.${status}`);
 expect(html).not.toContain('data-research-state');
 if(status==='accepted'){expect(html).toContain('data-mark="hypothesis"');expect(html).toContain('Observed fact');}
 else {expect(html).not.toContain('data-mark="hypothesis"');expect(html).not.toContain('Model hypothesis');expect(html).toContain(`explain.${status}Body`);}
});
