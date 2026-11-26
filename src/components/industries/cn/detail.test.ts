import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import industries from '../../../../messages/en/industries.json';
import research from '../../../../messages/en/research.json';
import {CnSeries} from './CnSeries';
import {CnDetail} from './CnDetail';
import {CnConstituents} from './CnConstituents';
import type {RunHeader,VendorCell,VendorSource} from '@/lib/industry/vendor/page-read';

function render(children:ReactNode) {
 return renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{industries,research},children}));
}
const header:RunHeader={licence:'internal',runId:'synthetic-run',kind:'financials',generation:1,activatedAt:'2032-07-20T02:03:04Z',
 fetchedFrom:'2032-07-13',fetchedTo:'2032-07-14',parserVersion:'fixture/1',mappingVersion:'fixture/2',codeVersion:'local',
 contentHash:'abc',datasetKey:'fixture',origin:'vendor_reported',historyClass:'reconstruction',gridSize:{codes:1,periods:3}};
const node={code:'801080.SI',nameEn:'Example Industry',nameZh:'合成行业',members:null,vendorCode:'fixture'};
const source:VendorSource={vendor:'fixture',product:'fixture',interface:'test',retrievalId:'source',sha256:'9'.repeat(64),
 template:{id:'synthetic',version:1},apiNames:[],fetchedAt:header.fetchedTo,locator:{block:0,row:2}};
function cell(periodEnd:string,valueText:string|null):VendorCell {
 return {metric:'revenue_yoy',code:node.code,periodEnd,unit:'pct',duration:'YTD',status:valueText===null?'missing':'ok',
  valueText,missingReason:valueText===null?'no_prior_period':null,source,derived:null};
}
it('plots two disconnected runs, with an equivalent table containing the missing reason and activation',()=>{
 const points=[cell('2030-12-31','6.3'),cell('2031-12-31',null),cell('2032-12-31','11.8')];
 points[2].derived={formula:'yoy/1',inputs:[cell('2032-12-31','94'),cell('2031-12-31','87')],memberSetChanged:true,
  memberCounts:{previous:'7',current:'9'}};
 const props={points,node,header,metric:'revenue_yoy',tableOnly:false};
 const html=render(createElement(CnSeries,props));
 expect(html.match(/data-series-segment=/g)).toHaveLength(2);
 expect(html).toContain('data-zero-baseline');
 expect(html).toMatch(/<text[^>]*>\+11.8%<\/text>/);
 expect(html).toContain('<table');
 expect(html).toMatch(/no prior period/i);
 expect(html).toContain('members 7 → 9, set changed');
 expect(html).toContain(header.activatedAt!);
 const table=render(createElement(CnSeries,{...props,tableOnly:true}));
 expect(table).not.toContain('<svg');
 expect(table).toContain('<table');
});
it('renders current snapshot provenance, six-digit codes, and previous/next page limits',()=>{
 const freshness={status:'fresh' as const,lastOkAt:header.fetchedTo};
 const view={state:'ok' as const,node,header:{...header,kind:'memberships' as const},freshness:{financials:freshness,memberships:freshness},
  total:4,pageSize:1,page:2,rows:[{securityCode:'001379',securityName:'Synthetic Issuer',source}]};
 const html=render(createElement(CnConstituents,{view,search:{page:'2'}}));
 for(const s of ['2032-07-14','Synthetic Issuer','001379','page=1','page=3','not provided by vendor','data-source-button'])expect(html).toContain(s);
 expect(html).not.toMatch(/001379\.|\/stock\/|type="date"|Member since|Member until/);
});

it('keeps the detail sections ordered and all stored metrics selectable when only the table is requested',()=>{
 const value=cell('2032-12-31','7.2');
 const fresh={status:'fresh' as const,lastOkAt:header.fetchedTo};
 const html=render(createElement(CnDetail,{view:{state:'ok',node,header,latest:[value],series:[value],constituents:null,
  freshness:{financials:fresh,memberships:fresh}},search:{view:'table',basis:'quarter',window:'5y',metric:'revenue_yoy'}}));
 const headings=Array.from(html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g),match=>match[1]);
 expect(headings).toEqual(['Latest values','Series','Valuation and percentiles','Prosperity dimensions','Judgments','Constituents preview']);
 for(const metric of Object.keys(industries.cnMetrics))expect(html).toContain('metric='+metric+'&amp;view=table&amp;window=5y');
 expect(html).not.toContain('data-zero-baseline');
 expect(html.match(/data-state="notServed"/g)).toHaveLength(2);
 expect(html).toContain('data-state="noJudgment"');
});

it('labels the origin inside each latest YoY card',()=>{
 const stored={...cell('2032-12-31','4.2'),metric:'net_income_parent_yoy'};
 const derived:VendorCell={...cell('2032-12-31','8.6'),source:null,derived:{formula:'yoy/1',
  inputs:[cell('2032-12-31','108.6'),cell('2031-12-31','100')],memberSetChanged:null,memberCounts:{current:null,previous:null}}};
 const fresh={status:'fresh' as const,lastOkAt:header.fetchedTo};
 const html=render(createElement(CnDetail,{view:{state:'ok',node,header,latest:[stored,derived],series:[],constituents:null,
  freshness:{financials:fresh,memberships:fresh}},search:{metric:'revenue_yoy'}}));
 const cards=Array.from(html.split('</section>')[0].matchAll(/<button\b[^>]*>(.*?)<\/button>/gs),m=>m[1].replace(/<[^>]*>/g,''));
 expect(cards).toHaveLength(2);
 expect(cards[0]).toContain('Parent net profit YoY');
 expect(cards[0]).toContain('Vendor-reported');
 expect(cards[1]).toContain('Revenue YoY');
 expect(cards[1]).toContain('Derived · yoy/1');
 expect(cards[1]).not.toContain('Vendor-reported');
});
