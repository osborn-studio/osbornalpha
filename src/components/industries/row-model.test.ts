import {orderSicRows} from "./row-model";

import {describe,expect,it} from 'vitest';
import {rowVisible,swLicencePending} from './row-model';

const schemes=(swPublic:boolean)=>[{scheme:'sw2021' as const,version:'2021' as const,datasetKey:'scheme:sw2021:2021' as never,public:swPublic},{scheme:'sic' as const,version:'sec' as never,datasetKey:'scheme:sic:sec' as never,public:true}];
describe('IndustryRow model',()=>{
 it('licence pending: A-share with a non-public SW scheme only',()=>{
  expect(swLicencePending('600519.SH',{schemes:schemes(false)})).toBe(true);
  expect(swLicencePending('000001.sz',{schemes:schemes(false)})).toBe(true);
  expect(swLicencePending('600519.SH',{schemes:schemes(true)})).toBe(false);
  expect(swLicencePending('AAPL',{schemes:schemes(false)})).toBe(false);
 });
 it('row visible with industries or a pending note; hidden otherwise',()=>{
  expect(rowVisible('600519.SH',{schemes:schemes(false),industries:[]})).toBe(true);
  expect(rowVisible('AAPL',{schemes:schemes(false),industries:[]})).toBe(false);
  expect(rowVisible('AAPL',{schemes:schemes(true),industries:[{} as never]})).toBe(true);
 });
});

it('SIC rows put displayable member sets first, by members descending then code',()=>{
 const nodes=['0001','7372','3674','0002','9999'].map(code=>({code}));
 const cells=[{code:'0001',periodEnd:'2025-12-31',nMembers:2},{code:'0002',periodEnd:'2025-12-31',nMembers:2},{code:'7372',periodEnd:'2025-12-31',nMembers:6},{code:'3674',periodEnd:'2025-12-31',nMembers:6}];
 expect(orderSicRows(nodes,cells).map(n=>n.code)).toEqual(['3674','7372','0001','0002','9999']);
});
