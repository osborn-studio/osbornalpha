import {createElement,createRef} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import zh from '../../../messages/zh/common.json';
import en from '../../../messages/en/common.json';
import {MoreSheet} from './MoreSheet';
vi.mock('next/link',()=>({default:({children,...props}:import('react').ComponentProps<'a'>)=>createElement('a',props,children)}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const render=(locale:'zh'|'en',open:boolean)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{common:locale==='zh'?zh:en},children:createElement(MoreSheet,{open,onClose:vi.fn(),triggerRef:createRef<HTMLButtonElement>()})}));
it('renders nothing when closed',()=>expect(render('zh',false)).toBe(''));
it.each(['zh','en'] as const)('renders ordered bilingual rows and switches in %s',locale=>{
 const html=render(locale,true);expect(html).toContain('role="dialog"');expect(html).toContain('aria-modal="true"');expect(html).toContain(`aria-label="${locale==='zh'?'更多':'More'}"`);expect(html).toContain(`aria-label="${locale==='zh'?'关闭':'Close'}"`);
 expect([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1])).toEqual(['/analyst','/tools','/settings','/about']);
 const rows=[...html.matchAll(/data-more-row="([^"]+)"[^>]*>/g)];expect(rows.map(m=>m[1])).toEqual(['analyst','tools','settings','language','theme','about']);for(const row of rows)expect(row[0]).toContain('min-h-[48px]');
 const labels=locale==='zh'?['分析','工具','设置','语言','主题','关于']:['Analyst','Tools','Settings','Language','Theme','About'];let last=-1;for(const label of labels){const index=html.indexOf(`>${label}<`);expect(index).toBeGreaterThan(last);last=index;}
 const groups=[...html.matchAll(/role="group"[^>]*>([\s\S]*?)<\/div>/g)];expect(groups).toHaveLength(2);for(const group of groups)expect([...group[1].matchAll(/aria-pressed="true"/g)]).toHaveLength(1);
 expect(html).toContain('text-text-muted text-[0.82em]');
});

it('focuses close, traps Tab, handles dismissals and restores trigger focus',async()=>{
 const {act}=await import('react');const {create}=await import('react-test-renderer');
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const events=new Map<string,EventListener>();
 const doc={activeElement:null as unknown,body:{style:{overflow:'auto'}},addEventListener:(key:string,fn:EventListener)=>events.set(key,fn),removeEventListener:(key:string)=>events.delete(key)};
 const first={focus:vi.fn(()=>{doc.activeElement=first;})};const last={focus:vi.fn(()=>{doc.activeElement=last;})};const trigger={focus:vi.fn()};
 vi.stubGlobal('document',doc);vi.stubGlobal('localStorage',{getItem:()=>null});vi.stubGlobal('window',{matchMedia:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}),addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const onClose=vi.fn();let root:ReturnType<typeof create>;
 try {
  await act(async()=>{root=create(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{common:en},children:createElement(MoreSheet,{open:true,onClose,triggerRef:{current:trigger as unknown as HTMLButtonElement}})}),{createNodeMock:element=>(element.props as {role?:string}).role==='dialog'?{querySelectorAll:()=>[first,last],contains:(node:unknown)=>node===first||node===last}:element.type==='button'?first:null});});
  expect(first.focus).toHaveBeenCalled();expect(doc.body.style.overflow).toBe('hidden');
  const press=(key:string,shiftKey=false)=>{const preventDefault=vi.fn();events.get('keydown')!({key,shiftKey,preventDefault} as unknown as Event);return preventDefault;};
  expect(press('Tab',true)).toHaveBeenCalled();expect(last.focus).toHaveBeenCalled();expect(press('Tab')).toHaveBeenCalled();expect(doc.activeElement).toBe(first);
  press('Escape');expect(onClose).toHaveBeenCalledTimes(1);
  root!.root.findByProps({'aria-label':'Close'}).props.onClick();expect(onClose).toHaveBeenCalledTimes(2);
  root!.root.findAllByType('div').find(node=>node.props['aria-hidden'])!.props.onClick();expect(onClose).toHaveBeenCalledTimes(3);
  for(const link of root!.root.findAllByType('a'))link.props.onClick();expect(onClose).toHaveBeenCalledTimes(7);
  await act(async()=>root!.unmount());expect(trigger.focus).toHaveBeenCalledOnce();expect(doc.body.style.overflow).toBe('auto');expect(events.has('keydown')).toBe(false);
 } finally {vi.unstubAllGlobals();}
});
