import {describe,expect,it} from 'vitest';
import config from '../next.config.mjs';

describe('legacy macro redirects',()=>{
 it('redirects every legacy landing and macro route permanently',async()=>{
  expect(await config.redirects?.()).toEqual([
   {source:'/dashboard',destination:'/macro',permanent:true},
   {source:'/today',destination:'/macro',permanent:true},
   {source:'/intel/macro',destination:'/macro',permanent:true},
   {source:'/intel/macro/:path*',destination:'/macro/:path*',permanent:true},
  ]);
 });
});
