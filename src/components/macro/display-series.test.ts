import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {displaySeriesRows} from './display-series';
import {ClockPhasePanel} from './ClockPhasePanel';
import type {WeightedRow} from './clock-weighted';
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k}));
const t=(k:string)=>k;
it('adds three US display rows, never CN, and missing values remain null',()=>{
 const rows=displaySeriesRows('US',{},'en');
 expect(rows.map(r=>r.id)).toEqual(['US_WALCL','US_RRPONTSYD','US_WTREGEN']);
 expect(rows.every(r=>r.weight===0&&r.latest===null)).toBe(true);
 expect(displaySeriesRows('CN',{},'en')).toEqual([]);
});
it('keeps scored totals and drivers identical when display rows are attached',()=>{
 const rows:WeightedRow[]=[{seriesId:'US_DFF',name:'Fed funds',unit:'pct',weight:10,state:'matched',latest:{observationId:'o',period:'2026-10-31',value:'4%'},comparisons:[],rule:'r',ruleId:'r',support:null,contribution:{recovery:5,overheat:3,stagflation:1,recession:1},reason:null}];
 const props={regime:'recovery' as const,index:0,current:true,expanded:true,rows,t,locale:'en' as const,metadataLoading:false,onToggle:()=>{},onClose:()=>{}};
 const before=renderToStaticMarkup(createElement(ClockPhasePanel,props));
 const after=renderToStaticMarkup(createElement(ClockPhasePanel,{...props,displayRows:displaySeriesRows('US',{},'en')}));
 const total=(html:string)=>html.match(/class="clock-total">([\s\S]*?)<\/span>/)?.[1];
 expect(total(after)).toEqual(total(before));expect(total(after)).toContain('5');
 expect(after.match(/class="clock-driver"/g)?.length).toBe(before.match(/class="clock-driver"/g)?.length);
 expect(after).toContain('US_WALCL');expect(before).not.toContain('US_WALCL');
 expect(rows).toHaveLength(1);expect(rows[0].contribution?.recovery).toBe(5);
});
