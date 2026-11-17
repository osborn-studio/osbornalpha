import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {DeviationCases} from './DeviationCases';
import {F4SummaryPanel} from './F4Summary';
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k,useLocale:()=> 'en'}));
vi.mock('./use-strategy-fetch',()=>({useStrategyFetch:()=>({state:{kind:'ok',data:{incomplete:false,cases:[{judgment_id:'j',selected:'recovery',realized:'overheat',as_of:'2026-10-31',evidence_state:'complete',diffs:[{series_id:'US_DFF',period_end:'2026-10-31',role:'latest',kind:'revised',subkind:null,registered:null,settled:null}]}]}},reload:()=>{}})}));
it('marks revised evidence and missing comparison values',()=>{
 const html=renderToStaticMarkup(createElement(DeviationCases,{region:'US'}));
 expect(html).toContain('data-research-state="revised"');expect(html).toContain('data-research-state="missing"');
});
it('keeps judgment lifecycle words outside the data badge vocabulary',()=>{
 const html=renderToStaticMarkup(createElement(F4SummaryPanel,{summary:{judgment_id:'j',selected:null,lifecycle:'retracted',outcome:null,calibration:'none',methodology:{id:'macro_regime',version:'v2'},as_of:'2026-10-31',href:null}}));
 expect(html).not.toContain('data-research-state');
 expect(html).toContain('f4.lifecycle.other');
});
