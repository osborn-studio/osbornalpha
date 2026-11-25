// Reviewed mapping must stay in sync with the SW2021 classification fixture.
import {expect,it} from 'vitest';
import fixture from '../fixtures/tushare/index_classify-SW2021-L1.json';
import {SW2021_L1_GILDATA,byIndexCode,byGildataCode} from './sw2021-gildata-codes';

it('maps all 31 distinct codes in both directions',()=>{
 expect(SW2021_L1_GILDATA).toHaveLength(31);
 for(const [indexCode,nameZh,,,gildataCode] of fixture.data.items){
  const expected={indexCode,nameZh,gildataCode};
  expect(byIndexCode(String(indexCode))).toEqual(expected);
  expect(byGildataCode(String(gildataCode))).toEqual(expected);
 }
 for(const key of ['indexCode','gildataCode'] as const)
  expect(new Set(SW2021_L1_GILDATA.map(r=>r[key])).size).toBe(31);
});

it('has a reviewed English name for every index code',async()=>{
 const {SW2021_L1_NAME_EN}=await import('./sw2021-names-en');
 expect(Object.keys(SW2021_L1_NAME_EN).sort()).toEqual(SW2021_L1_GILDATA.map(r=>r.indexCode).sort());
});
