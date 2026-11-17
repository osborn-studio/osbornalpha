import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,expectTypeOf,it,vi} from 'vitest';
import {CatalogCoverage} from './CatalogCoverage';
import {MacroStateValue,MacroStateLabel} from './MacroState';
vi.mock('next-intl',()=>({useTranslations:()=> (k:string)=>k}));
it.each(['M','R','missing','restricted','quarantined','rejected'] as const)('%s suppresses values but preserves the reason',status=>{
 const html=renderToStaticMarkup(React.createElement(MacroStateValue,{status,value:'SECRET_42',detail:'reason'}));
 expect(html).not.toContain('SECRET_42');expect(html).toContain('reason');expect(html).toContain('data-research-state');
});
it.each(['stale','late','revised'] as const)('%s retains the value and has a unified badge',status=>{
 const html=renderToStaticMarkup(React.createElement(MacroStateValue,{status,value:'4.2'}));
 expect(html).toContain('4.2');expect(html).toContain('data-research-state');
});
it('maps labels and treats an absent value as missing',()=>{
 expect(renderToStaticMarkup(React.createElement(MacroStateLabel,{status:'R'}))).toContain('withheld');
 expect(renderToStaticMarkup(React.createElement(MacroStateValue,{value:'—'}))).toContain('missing');
});

it('accepts data statuses but rejects arbitrary strings and workflow phases at compile time',()=>{
 type LabelStatus = React.ComponentProps<typeof MacroStateLabel>['status'];
 type ValueStatus = React.ComponentProps<typeof MacroStateValue>['status'];
 expectTypeOf<string>().not.toExtend<LabelStatus>();
 expectTypeOf<'insufficient' | 'failed' | 'none' | 'running' | 'not_matched'>().not.toExtend<LabelStatus>();
 expectTypeOf<string>().not.toExtend<ValueStatus>();
 expectTypeOf<'missing' | 'restricted' | 'rejected'>().toExtend<LabelStatus>();
});

it.each(['missing','restricted'] as const)('%s series keeps its unified data badge and reason',status=>{
 const html=renderToStaticMarkup(React.createElement(CatalogCoverage,{
  coverage:{verified:0,total:1,notVerified:[{seriesId:'TEST',name:'Test series',status,reason:'Source unavailable'}]},
  collection:[],t:key=>key,
 }));
 expect(html).toContain(`data-research-state="${status === 'restricted' ? 'withheld' : 'missing'}"`);
 expect(html).toContain('Test series');
 expect(html).toContain('Source unavailable');
});
