import {act,createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SourceDrawer} from './SourceDrawer';
import type {SourceDrawerProps} from '../research-ui/source-drawer/SourceDrawer';
import {SourceDrawer as SharedDrawer} from '../research-ui/source-drawer/SourceDrawer';
import {NextIntlClientProvider} from 'next-intl';
import research from '../../../messages/en/research.json';
import macro from '../../../messages/en/macro.json';
import type {VersionJson} from './view-model';
vi.mock('../research-ui/source-drawer/SourceDrawer',()=>({SourceDrawer:()=>null}));
const target={seriesId:'[series]',observationId:'[displayed]',name:'[name]',periodEnd:'2026-01-01',display:'4.2',unit:'percent',source:null};
const version:VersionJson={observation_id:'[displayed]',series_id:'[series]',version:1,value_text:'4.2',available_at:'2026-01-02T00:00:00Z',availability_basis:'first_seen',retrieval:null,evidence:null,locator:null,transform:null,derived_from:null,code_version:null,inputs:[]};
let root:ReactTestRenderer|undefined;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('HTMLElement',class {});vi.stubGlobal('window',{addEventListener:()=>{},removeEventListener:()=>{}});});
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;vi.unstubAllGlobals();});
const props=()=>root!.root.findByType(SharedDrawer).props;
it('delegates pending state and resolves exactly the displayed version',async()=>{
 let resolve!:(response:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>{root=create(h(SourceDrawer,{target,onClose:()=>{},t:k=>k,locale:'en'}));});
 expect(props().pending).toEqual(['source','times','transform']);expect(fetcher).toHaveBeenCalledWith('/api/macro/series/%5Bseries%5D/versions?period_end=2026-01-01');
 await act(async()=>{resolve(new Response(JSON.stringify({versions:[{...version,observation_id:'[newer]',version:2},version]})));});
 expect(props().input.payload.identity.id).toBe('[displayed]');expect(props().pending).toEqual([]);expect(props().failed).toEqual([]);
 await act(async()=>{root!.update(h(SourceDrawer,{target:null,onClose:()=>{},t:k=>k,locale:'en'}));});expect(props().input).toBeNull();
});
it('marks unreadable displayed evidence as failed without changing page value',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({versions:[{...version,observation_id:'[other]'}]}))));
 await act(async()=>{root=create(h(SourceDrawer,{target,onClose:()=>{},t:k=>k,locale:'en'}));});
 expect(props().failed).toEqual(['source','times','transform']);expect(props().failedText).toBe('drawer.loadFailed');expect(props().input.extras.value).toBe('4.2');
});
it('passes fetch errors and derived-input proof through the shared API',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('[failure]');}));
 await act(async()=>{root=create(h(SourceDrawer,{target,onClose:()=>{},t:k=>k,locale:'en'}));});expect(props().failed).toEqual(['source','times','transform']);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({versions:[{...version,derived_from:['[input]'],inputs:[{observation_id:'[input]',missing:true}]}]}))));
 await act(async()=>{root!.update(h(SourceDrawer,{target:{...target},onClose:()=>{},t:k=>k,locale:'en'}));});expect(props().slots.transform).toBeTruthy();expect(renderToStaticMarkup(props().slots.transform)).toContain('drawer.inputMissing');
});

it('keeps Publisher and one failure alert with no evidence link using real messages',async()=>{
 const t=(key:string)=>key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],macro) as string;
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('[failure]');}));
 await act(async()=>{root=create(h(SourceDrawer,{target:{...target,source:{publisher:{en:'Publisher fixture',zh:'Publisher fixture'},via:null,adapter:'fred_csv',rights:'public_domain',fetch_host:'example.test',attribution:{en:'Attribution',zh:'Attribution'}}},onClose:()=>{},t,locale:'en'}));});
 const {SourceDrawer:RealDrawer}=await vi.importActual<typeof import('../research-ui/source-drawer/SourceDrawer')>('../research-ui/source-drawer/SourceDrawer');
 const html=renderToStaticMarkup(h(NextIntlClientProvider,{locale:'en',messages:{research,macro},children:h(RealDrawer,props() as SourceDrawerProps)}));
 expect(html).toContain(research.drawer.fields.publisher);expect(html).toContain('Publisher fixture');
 expect(html.split(macro.drawer.loadFailed)).toHaveLength(2);expect(html).toContain('role="alert"');expect(html).not.toContain('/api/macro/evidence/');
});
