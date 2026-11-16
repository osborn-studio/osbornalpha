import {describe,expect,it} from 'vitest';
import type {LayoutLine} from '../types';
import {detectAmountUnit,detectEpsUnit} from './scale';

const u=(text:string,char_start=0,page_no=1)=>({page_no,line:{index:0,y:0,x0:0,x1:0,text,char_start,char_end:char_start+Array.from(text).length} as LayoutLine});
describe('amount unit (spec §7.5 step 3: currency words removed first, then the longest multiplier)',()=>{
 it('currency and multiplier, cited as the whole line',()=>{
  expect(detectAmountUnit([u('人民幣千元 人民幣千元',30,3)])).toEqual({ok:true,currency:'CNY',scale:'1000',cite:{page_no:3,char_start:30,char_end:41},evidence:[{page_no:3,char_start:30,char_end:41}]});
  expect(detectAmountUnit([u('千港元 千港元')])).toMatchObject({ok:true,currency:'HKD',scale:'1000'});
  expect(detectAmountUnit([u("HK$'000 HK$'000")])).toMatchObject({ok:true,currency:'HKD',scale:'1000'});
  expect(detectAmountUnit([u('RMB million')])).toMatchObject({ok:true,currency:'CNY',scale:'1000000'});
  expect(detectAmountUnit([u("US$'000,000")])).toMatchObject({ok:true,currency:'USD',scale:'1000000'});
  expect(detectAmountUnit([u('人民幣百萬元')])).toMatchObject({ok:true,currency:'CNY',scale:'1000000'});
  expect(detectAmountUnit([u('綜合損益表'),u('港幣千元',8)])).toMatchObject({ok:true,currency:'HKD',scale:'1000',cite:{char_start:8}});
 });
 it('R2-P2-1: currency and multiplier on separate lines — both are evidence, cited as one range spanning them',()=>{
  const r=detectAmountUnit([u('二零二五年 二零二四年',0),u('人民幣 人民幣',12),u('附註',20),u('千元 千元',23)]);
  expect(r).toEqual({ok:true,currency:'CNY',scale:'1000',cite:{page_no:1,char_start:12,char_end:28},evidence:[{page_no:1,char_start:12,char_end:19},{page_no:1,char_start:23,char_end:28}]});
  expect(detectAmountUnit([u('人民幣 人民幣',0,1),u('千元',0,2)])).toEqual({ok:false,reason:'unit_split_pages'});
 });
 it("'港元' never becomes the multiplier 元; currency without multiplier, several currencies or multipliers are refused",()=>{
  expect(detectAmountUnit([u('港元 港元')])).toEqual({ok:false,reason:'no_multiplier'});
  expect(detectAmountUnit([u('人民幣元')])).toEqual({ok:false,reason:'no_multiplier'});
  expect(detectAmountUnit([u('附註 二零二五年')])).toEqual({ok:false,reason:'no_currency'});
  expect(detectAmountUnit([u('人民幣千元 港元')])).toEqual({ok:false,reason:'currencies:CNY,HKD'});
  expect(detectAmountUnit([u('人民幣千元'),u('人民幣百萬元')])).toEqual({ok:false,reason:'multipliers:1000,1000000'});
 });
});
describe('per-share sub-unit (eps never inherits the table multiplier)',()=>{
 const s=(text:string,char_start=0)=>({page_no:2,text,char_start});
 it('港仙 / HK cents → HKD/share 0.01; 仙 / cents take the table currency; 元 forms → 1; the token is cited',()=>{
  expect(detectEpsUnit([s('基本（港仙）',10)],null)).toEqual({ok:true,unit:'HKD/share',scale:'0.01',cite:{page_no:2,char_start:13,char_end:15},inherited:false});
  expect(detectEpsUnit([s('每股盈利（仙）')],'CNY')).toMatchObject({ok:true,unit:'CNY/share',inherited:true});
  expect(detectEpsUnit([s('Basic'),s('Earnings per share (HK cents)')],'CNY')).toMatchObject({ok:true,unit:'HKD/share',scale:'0.01'});
  expect(detectEpsUnit([s('基本'),s('每股盈利（仙）')],'HKD')).toMatchObject({ok:true,unit:'HKD/share',scale:'0.01'});
  expect(detectEpsUnit([s('基本'),s('每股盈利（仙）')],null)).toEqual({ok:false,reason:'eps_currency'});
  expect(detectEpsUnit([s('基本'),s('每股盈利（人民幣元）')],'HKD')).toMatchObject({ok:true,unit:'CNY/share',scale:'1'});
  expect(detectEpsUnit([s('Basic (RMB cents)')],null)).toMatchObject({ok:true,unit:'CNY/share',scale:'0.01'});
  expect(detectEpsUnit([s('Basic (RMB)')],null)).toMatchObject({ok:true,unit:'CNY/share',scale:'1'});
  expect(detectEpsUnit([s('基本（港元）')],null)).toMatchObject({ok:true,unit:'HKD/share',scale:'1'});
  expect(detectEpsUnit([s('基本'),s('每股盈利')],'HKD')).toEqual({ok:false,reason:'eps_no_subunit'});
  // resolved across all the evidence (Task 14 review T14-02/04/05)
  expect(detectEpsUnit([s('Earnings per share (RMB)',0),s('(cents)',25)],'HKD')).toMatchObject({ok:true,unit:'CNY/share',scale:'0.01',inherited:false});
  expect(detectEpsUnit([s('Earnings per share (RMB)',0),s('x',25),s('(cents)',27)],'HKD')).toMatchObject({ok:true,unit:'CNY/share',scale:'0.01',inherited:true,currencyCite:{char_start:20,char_end:23}});
  expect(detectEpsUnit([s('Earnings per share (US cents)')],'CNY')).toMatchObject({ok:true,unit:'USD/share',scale:'0.01',inherited:false});
  expect(detectEpsUnit([s('每股盈利（分）')],'CNY')).toMatchObject({ok:true,unit:'CNY/share',scale:'0.01',inherited:true});
  expect(detectEpsUnit([s('EPS (EUR cents)')],'CNY')).toEqual({ok:false,reason:'eps_qualifier:EUR'});
  expect(detectEpsUnit([s('(HK cents) (RMB)')],'CNY')).toEqual({ok:false,reason:'eps_currencies:CNY,HKD'});
 });
});
