import {expect,it} from 'vitest';
import {registrySources} from './research-sources';
it('attributes only supplied registry series, including display-only series, with publisher and relay',()=>{
 expect(registrySources(['US_WALCL','US_WTREGEN','unknown'],'en')).toEqual([{publisher:'Board of Governors of the Federal Reserve System',relay:'FRED (Federal Reserve Bank of St. Louis)'}]);
 expect(registrySources([],'zh')).toEqual([]);
});
