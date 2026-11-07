// src/lib/entities/identifiers/names.test.ts
import {describe,it,expect} from 'vitest';
import {NAMES_VERSION,normalizeCompanyName} from './names';

// 20 real A+H issuers: [A-side registered name, H-side list-style name].
const SAME:[string,string][]=[
 ['BYD Company Limited','BYD COMPANY LIMITED - H SHS'],
 ['Weichai Power Co., Ltd.','WEICHAI POWER CO LTD - H'],
 ['Ping An Insurance (Group) Company of China, Ltd.','PING AN INSURANCE (GROUP) COMPANY OF CHINA LTD (H)'],
 ['China Merchants Bank Co., Ltd.','CHINA MERCHANTS BANK CO., LTD. - H SHS'],
 ['Industrial and Commercial Bank of China Limited','INDUSTRIAL AND COMMERCIAL BANK OF CHINA LTD - H'],
 ['China Construction Bank Corporation','CHINA CONSTRUCTION BANK CORP - H'],
 ['Bank of China Limited','BANK OF CHINA LTD - H'],
 ['PetroChina Company Limited','PETROCHINA CO LTD - H'],
 ['China Petroleum & Chemical Corporation','CHINA PETROLEUM & CHEMICAL CORP - H'],
 ['China Life Insurance Company Limited','CHINA LIFE INSURANCE CO LTD - H'],
 ['Zijin Mining Group Co., Ltd.','ZIJIN MINING GROUP CO LTD - H'],
 ['Anhui Conch Cement Company Limited','ANHUI CONCH CEMENT CO LTD - H'],
 ['Tsingtao Brewery Company Limited','TSINGTAO BREWERY CO LTD - H'],
 ['ZTE Corporation','ZTE CORP - H'],
 ['Great Wall Motor Company Limited','GREAT WALL MOTOR CO LTD - H'],
 ['China Shenhua Energy Company Limited','CHINA SHENHUA ENERGY CO LTD - H'],
 ['Midea Group Co., Ltd.','MIDEA GROUP CO LTD - H'],
 ['中国平安保险（集团）股份有限公司','中国平安保险(集团)股份有限公司'],
 ['潍柴动力股份有限公司','潍柴动力'],
 ['紫金矿业集团股份有限公司','紫金矿业'],
];
const DIFFERENT:[string,string][]=[
 ['China Life Insurance Company Limited','China Pacific Insurance (Group) Co., Ltd.'],
 ['Bank of China Limited','Bank of Communications Co., Ltd.'],
 ['China Shenhua Energy Company Limited','China Coal Energy Company Limited'],
 ['中国石油天然气股份有限公司','中国石油化工股份有限公司'],
];

describe('normalizeCompanyName',()=>{
 it.each(SAME)('%s ≡ %s',(a,h)=>{
  expect(normalizeCompanyName(a)).toBe(normalizeCompanyName(h));
  expect(normalizeCompanyName(a)).not.toBe('');
 });
 it.each(DIFFERENT)('%s ≠ %s',(a,b)=>expect(normalizeCompanyName(a)).not.toBe(normalizeCompanyName(b)));
 it('lower-cases, converts full width, strips punctuation and only trailing suffix words',()=>{
  expect(normalizeCompanyName('Ping An Insurance (Group) Company of China, Ltd.')).toBe('pinganinsurancegroupcompanyofchina');
  expect(normalizeCompanyName('ＢＹＤ　Ｃｏｍｐａｎｙ')).toBe('byd');
  expect(normalizeCompanyName('Costco Wholesale Corp')).toBe('costcowholesale');
  expect(normalizeCompanyName('Group Holdings Limited')).toBe('');
  expect(NAMES_VERSION).toBe('company-names/1');
 });
});
