import {describe,expect,it} from 'vitest';
import {MINHASH_SIZE,jaccard,minhash,shingles} from './minhash';

const para='恒生电子股份有限公司关于股票期权限制行权期间的提示性公告。公司董事会决定，自2026年9月23日起至2026年10月20日止，为股票期权限制行权期间。期间内激励对象不得行权。本公告所述事项不构成对投资者的任何承诺，敬请注意投资风险。公司将按照相关规定及时履行信息披露义务。';
const base=para+para.replace('提示性公告','补充公告')+para.replace('董事会','监事会');
describe('minhash',()=>{
 it('builds character 3-gram shingles without whitespace and case',()=>{
  expect([...shingles('A b\nC d')]).toEqual(['abc','bcd']);
  expect(shingles('ab').size).toBe(0);
 });
 it('is deterministic and has the configured size',()=>{
  const a=minhash(base),b=minhash(base);
  expect(a).toHaveLength(MINHASH_SIZE);expect(MINHASH_SIZE).toBe(128);
  expect(Array.from(a)).toEqual(Array.from(b));
  expect(jaccard(a,b)).toBe(1);
 });
 it('scores near-duplicates high and unrelated text low',()=>{
  // A syndicated copy: one clause dropped and a byline appended; most 3-grams survive.
  const near=base.replace('公司董事会决定，','')+'（来源：巨潮资讯）';
  expect(jaccard(minhash(base),minhash(near))).toBeGreaterThan(0.7);
  const other='Palantir Technologies Inc. filed a Form 8-K reporting quarterly results and a new US commercial contract.';
  expect(jaccard(minhash(base),minhash(other))).toBeLessThan(0.1);
  expect(jaccard(minhash(''),minhash(base))).toBe(0);
 });
});
