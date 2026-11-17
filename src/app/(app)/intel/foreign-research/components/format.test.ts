// Decimal, citation and chart helpers for the public report pages (spec §9.3).
import {describe,expect,it} from 'vitest';
import {citationFor,displayTitle,fmtNum,fmtPct,groupSnippets,groupThousands,provenanceKey,relChange,shortId,snippetsFor,stepChart,spreadChart} from './format';
import type {PublicCitationDto,PublicSnippetDto} from '@/lib/broker-research/public-dto';
const cit=(o:Partial<PublicCitationDto>={}):PublicCitationDto=>({fieldId:'f1',targetKey:'600000.SH',field:'target_price',occurrence:1,page:1,valueText:'10',valueNum:'10',valueCurrency:'CNY',valueUnit:'price',valueDate:null,status:'confirmed',extractorKind:'llm',...o});
const snip=(id:string,purpose:PublicSnippetDto['purpose'],fieldId:string|null=null):PublicSnippetDto=>({snippetId:id,fieldId,targetKey:null,purpose,page:1,text:id});

describe('public display numbers and charts',()=>{
 it('groups decimals and rounds signed fractions',()=>{
  expect(groupThousands('1234567.890')).toBe('1,234,567.890');
  expect(groupThousands('-1234')).toBe('−1,234');
  expect(fmtNum(null)).toBe('—');
  expect(fmtPct('0.3487',{signed:true})).toBe('+34.9%');
  expect(fmtPct('-0.093',{signed:true})).toBe('−9.3%');
  expect(fmtPct('0.00049',{signed:true})).toBe('0.0%');
  expect(fmtPct('0.082')).toBe('8.2%');
  expect(fmtPct('1.5',{signed:true})).toBe('+150.0%');
  expect(fmtPct(null)).toBe('—');
  expect(fmtPct('abc')).toBe('—');
  expect(fmtPct('0.34850')).toBe('34.9%');
 });
 it('computes relative changes in fixed point',()=>{
  expect(relChange('20','21')).toBe('0.050000');
  expect(relChange('3','2')).toBe('-0.333334');
  expect(relChange('0','1')).toBeNull();
  expect(relChange(null,'1')).toBeNull();
  expect(shortId('11111111-2222-4333-8444-555555555555')).toBe('1111…5555');
 });
 it('selects title provenance and joins only matching public snippets',()=>{
  const title={text:'Original',isRewritten:true,zh:'译名',en:null,isTranslation:true,modelId:'model-t'};
  expect(displayTitle(title,'zh')).toEqual({text:'译名',translated:true,rewritten:false,modelId:'model-t'});
  expect(displayTitle(title,'en')).toEqual({text:'Original',translated:false,rewritten:true,modelId:null});
  expect(displayTitle({...title,isTranslation:false},'zh')).toEqual({text:'Original',translated:false,rewritten:true,modelId:null});
  expect(provenanceKey(cit())).toBe('llmConfirmed');
  expect(provenanceKey(cit({status:'corrected'}))).toBe('llmCorrected');
  expect(provenanceKey(cit({extractorKind:'human'}))).toBe('humanAdded');
  expect(provenanceKey(cit({status:'absent'}))).toBe('absent');
  expect(provenanceKey(cit({extractorKind:null}))).toBe('unknown');
  expect(citationFor([cit({occurrence:2,page:5}),cit({occurrence:1,page:3})],'600000.SH','target_price')?.page).toBe(3);
  expect(citationFor([cit()],'600000.SH','wacc')).toBeNull();
  expect(snippetsFor([snip('a','target','f1'),snip('b','target','f2')],cit()).map(s=>s.snippetId)).toEqual(['a']);
  expect(snippetsFor([snip('a','target','f1')],null)).toEqual([]);
  expect(snippetsFor([snip('a','target','f1')],cit({fieldId:null}))).toEqual([]);
  expect(groupSnippets([snip('a','risk'),snip('b','rating')]).map(([p])=>p)).toEqual(['rating','risk']);
 });
 it('draws step and spread geometry without inventing prices',()=>{
  const box={width:1000,height:200,left:60,right:20,top:20,bottom:30};
  const c=stepChart([{date:'2026-01-01',value:'10',label:'buy',reportId:'a'},{date:'2026-07-01',value:null,label:'',reportId:'b'},{date:'2026-12-31',value:'12',label:'buy',reportId:'c'}],box)!;
  expect(c.dots.map(d=>d.reportId)).toEqual(['a','c']);
  expect(c.dots[0].cy).toBeGreaterThan(c.dots[1].cy);
  expect(c.path).toMatch(/^M60 \d+(\.\d)? H980 V\d+(\.\d)?$/);
  expect(c.yTicks).toHaveLength(3);
  expect(c.xTicks.map(x=>x.label)).toEqual(['2026-01','2026-12']);
  expect(stepChart([{date:'2026-01-01',value:null,label:'',reportId:'a'}],box)).toBeNull();
  const s=spreadChart([{key:'a',priceAtReport:'8',target:'10'},{key:'b',priceAtReport:'9',target:null}],box,40)!;
  expect(s.rows[0].targetX).toBeGreaterThan(s.rows[0].priceX!);
  expect(s.rows[1].targetX).toBeNull();
  expect(s.rows[1].y).toBeGreaterThan(s.rows[0].y);
  expect(spreadChart([{key:'a',priceAtReport:null,target:null}],box,40)).toBeNull();
 });
});
