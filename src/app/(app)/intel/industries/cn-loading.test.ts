import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import Loading from './loading';
const route=vi.hoisted(()=>({path:'/intel/industries',scheme:''}));
vi.mock('next/navigation',()=>({usePathname:()=>route.path,useSearchParams:()=>new URLSearchParams({scheme:route.scheme})}));
vi.mock('@/components/industries/StateNotice',()=>({StateNotice:()=>createElement('div',null,'skeleton')}));
it('keeps the SIC loading state and withholds the SW skeleton on every route',()=>{
 for(const [path,scheme,expected] of [
  ['/intel/industries','sic','skeleton'],['/intel/industries/sic/3674','', 'skeleton'],
  ['/intel/industries','sw2021',''],['/intel/industries/sw2021/example','', ''],['/intel/industries/sw2021/example/constituents','',''],
 ]){
  Object.assign(route,{path,scheme});
  const html=renderToStaticMarkup(createElement(Loading));
  if(expected)expect(html).toContain(expected);else expect(html).toBe('');
 }
});
