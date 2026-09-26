import {describe,expect,it} from 'vitest';
import {normalizeTitle,normalizeUrl} from './normalize';

describe('normalizeUrl',()=>{
 it('canonicalizes scheme, host, tracking params, fragments and trailing slashes',()=>{
  expect(normalizeUrl('HTTP://WWW.Example.com/a/b/?utm_source=x&b=2&a=1&fbclid=z#frag')).toBe('https://example.com/a/b?a=1&b=2');
  expect(normalizeUrl('https://example.com/a/b/')).toBe('https://example.com/a/b');
  expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  expect(normalizeUrl('https://finance.sina.com.cn/x.shtml?spm=1.2&from=wechat')).toBe('https://finance.sina.com.cn/x.shtml');
 });
 it('returns null for missing or unparsable urls and keeps meaningful params',()=>{
  expect(normalizeUrl(null)).toBeNull();expect(normalizeUrl('')).toBeNull();expect(normalizeUrl('not a url')).toBeNull();
  expect(normalizeUrl('http://static.cninfo.com.cn/finalpage/2026-09-23/1225576776.PDF')).toBe('https://static.cninfo.com.cn/finalpage/2026-09-23/1225576776.PDF');
  expect(normalizeUrl('https://www.sec.gov/Archives/edgar/data/1321655/000132165526000039/pltr-20260803.htm')).toBe('https://sec.gov/Archives/edgar/data/1321655/000132165526000039/pltr-20260803.htm');
 });
});

describe('normalizeTitle',()=>{
 it('folds width, case, punctuation and whitespace and strips known site suffixes',()=>{
  expect(normalizeTitle('恒生电子：关于股票期权限制行权期间的提示性公告_新浪财经')).toBe('恒生电子关于股票期权限制行权期间的提示性公告');
  expect(normalizeTitle('恒生电子 关于股票期权限制行权期间的提示性公告 - 东方财富网')).toBe('恒生电子关于股票期权限制行权期间的提示性公告');
  expect(normalizeTitle('Palantir  Files 8-K (Aug 3, 2026) | Yahoo Finance')).toBe('palantirfiles8kaug32026');
  expect(normalizeTitle('ＡＢＣ　テスト')).toBe('abcテスト');
 });
 it('keeps a genuine trailing segment that is not a site name and returns null for empty',()=>{
  expect(normalizeTitle('巨潮资讯 - 公告')).toBe('巨潮资讯公告');
  expect(normalizeTitle('  ')).toBeNull();expect(normalizeTitle(null)).toBeNull();
 });
});
