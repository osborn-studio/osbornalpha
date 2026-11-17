import {createElement,useEffect} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {NextIntlClientProvider} from 'next-intl';
import {afterEach,expect,it,vi} from 'vitest';
import company from '../../../messages/en/company.json';
import research from '../../../messages/en/research.json';
import {DrawerHost,useDrawers,type DrawerTarget} from './DrawerHost';
import {DrawerShell} from './DrawerShell';
const counts=vi.hoisted(()=>({mounted:0,unmounted:0}));
vi.mock('./useCompanyFetch',()=>({useCompanyFetch:()=>({state:{status:'loading'},retry:()=>{}})}));
vi.mock('./FormulaDrawer',()=>({FormulaDrawer:({onClose,onOpenInput}:{onClose:()=>void;onOpenInput:(id:string)=>void})=>{
 useEffect(()=>{counts.mounted++;return()=>{counts.unmounted++;};},[]);
 return createElement(DrawerShell,{label:'Formula',kicker:'Formula',title:'Formula',onClose,children:createElement('button',{'data-testid':'input',onClick:()=>onOpenInput('fact')},'Input')});
}}));
afterEach(()=>vi.unstubAllGlobals());
it('keeps formula mounted and inert, closes only top, and restores the exact opener after shared cleanup',async()=>{
 const doc={activeElement:null as FakeElement|null,body:{style:{overflow:'auto'}}};
 class FakeElement {isConnected=true;focus(){doc.activeElement=this;}}
 vi.stubGlobal('HTMLElement',FakeElement);vi.stubGlobal('document',doc);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 let open:(target:DrawerTarget)=>void=()=>{};
 function Opener(){open=useDrawers().open;return createElement('button',null,'Open');}
 let renderer:ReactTestRenderer;
 await act(async()=>{renderer=create(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{company,research},children:createElement(DrawerHost,{ticker:'AAPL',asOf:null,admin:false,children:createElement(Opener)})}),{createNodeMock:()=>new FakeElement()});});
 const pageOpener=new FakeElement();pageOpener.focus();
 await act(async()=>open({kind:'formula',metric:'fcf',cell:{} as never,periodLabel:'2024',computedAt:null,computedAtKind:'live',basedOnRev:null,scaleExp:0}));
 expect(counts.mounted).toBe(1);expect(doc.body.style.overflow).toBe('hidden');
 const inputOpener=new FakeElement();inputOpener.focus();
 await act(async()=>renderer.root.findByProps({'data-testid':'input'}).props.onClick());
 expect(renderer!.root.findAllByProps({role:'dialog'})).toHaveLength(2);
 expect(renderer!.root.findAllByProps({'aria-hidden':true}).some(n=>n.props.inert===true)).toBe(true);
 // Even an explicitly dispatched lower backdrop callback cannot pop the top.
 const backdrops=renderer!.root.findAll(n=>n.type==='div'&&n.props['aria-hidden']===true&&typeof n.props.onClick==='function');
 await act(async()=>backdrops[0].props.onClick());
 expect(renderer!.root.findAllByProps({role:'dialog'})).toHaveLength(2);
 const sourceRoot=renderer!.root.findAll(n=>n.type==='div'&&typeof n.props.onKeyDown==='function').at(-1)!;
 const stopPropagation=vi.fn();
 await act(async()=>sourceRoot.props.onKeyDown({key:'Escape',stopPropagation}));
 expect(stopPropagation).toHaveBeenCalledOnce();expect(doc.activeElement).toBe(inputOpener);
 expect(renderer!.root.findAllByProps({role:'dialog'})).toHaveLength(1);
 expect(counts.unmounted).toBe(0);expect(doc.body.style.overflow).toBe('hidden');
 const formulaBackdrop=renderer!.root.find(n=>n.type==='div'&&n.props['aria-hidden']===true&&typeof n.props.onClick==='function');
 await act(async()=>formulaBackdrop.props.onClick());
 expect(doc.activeElement).toBe(pageOpener);expect(doc.body.style.overflow).toBe('auto');expect(counts.unmounted).toBe(1);
 await act(async()=>renderer!.unmount());
});
