import {createElement,act} from 'react';
import {create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
import {ThemeToggle} from '../ThemeToggle';
vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key}));
it('reflects a phone theme change when desktop controls are reopened',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);let theme='dark';
 vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='theme'?theme:'cn'});
 vi.stubGlobal('document',{documentElement:{setAttribute:vi.fn(),classList:{remove:vi.fn(),add:vi.fn()}}});
 let root:ReturnType<typeof create>;
 try {
  await act(async()=>{root=create(createElement(ThemeToggle));});
  theme='light';await act(async()=>root!.root.findByProps({'aria-label':'themeToggleAria'}).props.onClick());
  const light=root!.root.findAllByType('button').find(b=>b.children.includes('themeLight'))!;
  expect(light.props.className).toContain('bg-accent-dim');
 } finally {await act(async()=>root!.unmount());vi.unstubAllGlobals();}
});
