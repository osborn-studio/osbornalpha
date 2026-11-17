import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {describe,it,expect} from 'vitest';
import zh from '../../../../messages/zh/research.json';
import en from '../../../../messages/en/research.json';
import {SourceDrawer} from '../index';
import {drawerSections,drawerHeader,drawerRevised} from './model';
import {EVIDENCE_KINDS,DRAWER_SECTIONS,type SourceDrawerInput,type SourceDrawerPayload} from './types';
const labels=(key:string)=>key;
const payload=(kind:SourceDrawerPayload['kind']):SourceDrawerPayload=>({kind,identity:{id:'[observation_id]',label:'[object]'},source:{publisher:'[publisher-secret]',adapter:'[adapter]',url:null,locator:null,evidence_sha256:null},times:{period:'[period-secret]',available_at:'[available]',ingested_at:null},transform:{code_version:null,mapping_version:null,method_version:null},licence:{status:'[status]',note_key:'[note]'},attribution_key:'[attribution]',links:{module_href:'/module/[id]'}});
const ok:SourceDrawerInput={variant:'ok',payload:payload('macro_observation'),extras:{value:'[value-secret]'}};
const withheld:SourceDrawerInput={variant:'withheld',kind:'macro_observation',identity:ok.payload.identity,reason:{code:'[reason-code]',text:'[reason-text]'}};
const retracted:SourceDrawerInput={variant:'retracted',kind:'macro_observation',identity:ok.payload.identity,retraction:{category:'[category]',at:null}};
const revised:SourceDrawerInput={...ok,variant:'revised',revised:{frozen:{value:'4.2',available_at:'[frozen-at]'},current:{value:'4.3',available_at:'[current-at]'}}};
it.each(EVIDENCE_KINDS)('models all six ordered sections for %s',kind=>{
 const sections=drawerSections({variant:'ok',payload:payload(kind),extras:{rows:{source:[{key:'coverage',label:'Coverage',value:'2/3',mono:true}]} }},labels,labels);
 expect(sections.map(s=>s.id)).toEqual(DRAWER_SECTIONS);expect(sections.map(s=>s.no)).toEqual([1,2,3,4,5,6]);
 for(const key of ['url','locator','sha256','ingestedAt','methodVersion','mappingVersion','codeVersion'])expect(sections.flatMap(s=>s.rows).find(r=>r.key===key)?.value).toBeNull();
 expect(sections[1].rows.at(-1)?.key).toBe('coverage');expect(sections[2].rows.some(r=>r.key==='coverage')).toBe(false);
 expect(sections[5].rows[0]).toMatchObject({label:`links.module.${kind}`,value:`links.module.${kind}`,href:'/module/[id]'});
});
it('withholds all value and provenance fields',()=>{
 const sections=drawerSections(withheld,labels,labels);expect(sections.map(s=>s.id)).toEqual(['identity']);
 for(const secret of ['[publisher-secret]','[period-secret]','[value-secret]'])expect(JSON.stringify(sections)).not.toContain(secret);
 expect(drawerHeader(withheld)).toMatchObject({value:null,states:['withheld']});
});
it('retracts values and exposes category and time',()=>{const s=drawerSections(retracted,labels,labels);expect(s.map(x=>x.id)).toEqual(['identity']);expect(s[0].rows.map(r=>r.key)).toEqual(['object','evidenceId','category','retractedAt']);expect(drawerHeader(retracted).states).toEqual(['retracted']);expect(drawerRevised(retracted)).toBeNull();});
it('keeps frozen and current values separate',()=>{expect(drawerSections(revised,labels,labels)).toHaveLength(6);expect(drawerHeader(revised).states).toContain('revised');expect(drawerRevised(revised)).toEqual(revised.revised);expect(drawerRevised(ok)).toBeNull();});
it('models optional rows, links, null relay and header overrides',()=>{
 const input:SourceDrawerInput={...ok,extras:{as_of:'[asof]',relay:null,evidence_href:'/proof',transform_label:'level',states:['stale'],mark:'judgment',links:[{label:'Raw',href:'/raw'}]}};
 const s=drawerSections(input,labels,labels);expect(s[0].rows.at(-1)).toMatchObject({key:'asOf',mono:true});expect(s[1].rows.find(r=>r.key==='relay')?.value).toBe('noRelay');expect(s[1].rows.find(r=>r.key==='sha256')).toMatchObject({copy:true,href:'/proof'});expect(s[5].rows.at(-1)?.href).toBe('/raw');expect(drawerHeader(input)).toMatchObject({mark:'judgment',states:['stale'],period:'[period-secret]'});
});
for(const [locale,messages] of [['zh',zh],['en',en]] as const)describe(locale,()=>{
 const render=(input:SourceDrawerInput|null,props:Partial<Parameters<typeof SourceDrawer>[0]>={})=>renderToStaticMarkup(h(NextIntlClientProvider,{locale,messages:{research:messages},children:h(SourceDrawer,{input,onClose:()=>{},...props})}));
 it('renders nothing when closed',()=>expect(render(null)).toBe(''));
 it('layers the drawer above the floating Copilot button',()=>{
  expect(render(ok).match(/^<div class="([^"]*)"/)?.[1].split(' ')).toContain('z-[60]');
 });
 it.each(['fact','judgment'] as const)('shows the %s mark once per breakpoint and keeps state badges visible',mark=>{
  const html=render({...ok,extras:{mark,states:['stale']}});
  const header=html.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? '';
  expect(header.match(/<span class="hidden sm:inline-flex"><span[^>]*>([^<]*)<\/span><\/span>/)?.[1]).toBe(messages.marks[mark]);
  expect(header).toMatch(/<\/span><\/span><span[^>]*data-research-state="stale"/);
  expect(html.split('<header')[0].match(/<span class="[^"]*sm:hidden"><span[^>]*>([^<]*)<\/span><\/span>/)?.[1]).toBe(messages.marks[mark]);
 });
 it.each(['history','revised'] as const)('pads every %s table cell and removes first-column left padding',kind=>{
  const input:SourceDrawerInput=kind==='revised'?revised:{...ok,extras:{revisions:[{period:'[period]',value:'4.2',available:'[at]',version:'v1',current:true}]}};
  const table=render(input).match(/<table[^>]*>[\s\S]*?<\/table>/)?.[0] ?? '';
  const cells=[...table.matchAll(/<(?:th|td)\b[^>]*class="([^"]*)"/g)];
  expect(cells).toHaveLength(kind==='revised'?6:8);
  for(const cell of cells)expect(cell[1].split(' ')).toContain('px-1.5');
  const firstCells=[...table.matchAll(/<tr\b[^>]*><(?:th|td)\b[^>]*class="([^"]*)"/g)];
  expect(firstCells).toHaveLength(2);
  for(const cell of firstCells)expect(cell[1].split(' ')).toContain('pl-0');
 });
 it('renders translated ordered sections and missing fields',()=>{
  const html=render(ok);expect(html).toContain('role="dialog"');expect(html).toContain('aria-modal="true"');expect([...html.matchAll(/data-drawer-section="(.*?)"/g)].map(m=>m[1])).toEqual(DRAWER_SECTIONS);
  DRAWER_SECTIONS.forEach((id,i)=>expect(html.replace(/<[^>]*>/g,'')).toContain(`${i+1} · ${messages.drawer.sections[id]}`));expect(html).toContain('data-research-state="missing"');expect(html).not.toContain('>0<');expect(html).toContain(`aria-label="${messages.drawer.close}"`);expect(html).toContain('href="/module/[id]"');expect(html).toContain(messages.marks.fact);
 });
 it('renders links as wrapping buttons without duplicate labels',()=>{
  const section=render(ok).split('data-drawer-section="links"')[1].split('</section>')[0];
  expect(section).not.toContain('<dt');expect(section).not.toContain('<dl');
  expect(section).toContain('hidden sm:block');
  const link=section.match(/<a[^>]*>/)?.[0] ?? '';
  expect(link).toContain('hidden sm:inline-flex');expect(link).toContain('min-h-[32px]');
  expect(section).toContain('flex flex-wrap');
 });
 it('keeps extra links visible on mobile',()=>{
  const section=render({...ok,extras:{links:[{label:'Extra',href:'/extra'}]}}).split('data-drawer-section="links"')[1].split('</section>')[0];
  expect(section).not.toContain('hidden sm:block');
  const link=section.match(/<a[^>]*href="\/extra"[^>]*>/)?.[0] ?? '';
  expect(link).toContain('min-h-[32px]');expect(link).not.toContain('hidden');
 });
 it.each(['http://example.com','https://example.com'])('opens external row and button links safely: %s',url=>{
  const html=render({...ok,payload:{...ok.payload,source:{...ok.payload.source,url},links:{module_href:url+'/module'}},extras:{links:[{label:'Internal',href:'/macro/x'},{label:'External',href:url+'/extra'}]}});
  const links=[...html.matchAll(/<a[^>]*>/g)].map(m=>m[0]);
  const external=links.filter(link=>link.includes(`href="${url}`) && !link.includes('/module'));
  expect(external).toHaveLength(2);
  for(const link of links.filter(link=>link.includes('/module')))expect(link).not.toContain('target=');
  for(const link of external){expect(link).toContain('target="_blank"');expect(link).toContain('rel="noopener noreferrer"');}
  const internal=links.find(link=>link.includes('href="/macro/x"'));
  expect(internal).toBeDefined();expect(internal).not.toContain('target=');expect(internal).not.toContain('rel=');
 });
 it('uses an SVG close icon with hover and focus styles',()=>{
  const close=render(ok).match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
  expect(close).toContain('<svg');expect(close).not.toContain('×');
  expect(close).toContain('hover:bg-[var(--accent-wash)]');
  expect(close).toContain('focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent');
 });
 it('renders withheld identity and reason only',()=>{const html=render(withheld);expect(html.match(/data-drawer-section=/g)).toHaveLength(1);expect(html).toContain('data-research-state="withheld"');expect(html).toContain('[reason-text]');expect(html).toContain('[reason-code]');for(const id of ['source','times','transform'] as const)expect(html).not.toContain(`data-drawer-section="${id}"`);expect(html).not.toContain('<table');});
 it('renders retraction without history',()=>{const html=render(retracted);expect(html.match(/data-drawer-section=/g)).toHaveLength(1);expect(html).toContain('data-research-state="retracted"');expect(html).not.toContain('<table');});
 it('renders both revision values',()=>{const html=render(revised);expect(html).toContain('4.2');expect(html).toContain('4.3');expect(html).toContain('data-research-state="revised"');expect(html).toContain(messages.drawer.revised.note);});
 it('keeps known pending rows, drops unknown rows and suppresses slots and tables',()=>{
  const html=render({...revised,payload:{...revised.payload,source:{...revised.payload.source,adapter:''}}},{pending:['source','times'],slots:{source:h('span',null,'[slot]')}});
  expect(html.match(/aria-busy="true"/g)).toHaveLength(2);
  const source=html.split('data-drawer-section="source"')[1].split('</section>')[0];
  expect(source).toContain('[publisher-secret]');expect(source).not.toContain('<dt class="text-text-dim">'+messages.drawer.fields.adapter);
  expect(source).not.toContain(messages.drawer.fields.url);expect(source.indexOf('[publisher-secret]')).toBeLessThan(source.indexOf('aria-busy'));
  expect(html).not.toContain('[slot]');expect(html).not.toContain('<table');
 });
 it('renders three failed sections with one alert and omits empty later sections',()=>{
  const html=render(ok,{failed:['transform','times','source'],failedText:'[failed]',slots:{times:h('span',null,'[slot]')}});
  expect(html.match(/\[failed\]/g)).toHaveLength(1);expect(html).toContain('role="alert"');
  const source=html.split('data-drawer-section="source"')[1].split('</section>')[0];
  expect(source).toContain('[publisher-secret]');expect(source).toContain('[failed]');
  expect(html).not.toContain('data-drawer-section="transform"');expect(html).not.toContain('[slot]');
 });
 it('normalises empty standard values to the missing badge',()=>{
  const input:SourceDrawerInput={...ok,payload:{...ok.payload,source:{...ok.payload.source,publisher:''}}};
  expect(drawerSections(input,labels,labels)[1].rows[0].value).toBeNull();
  expect(render(input)).toMatch(/<dd[^>]*><span[^>]*data-research-state="missing"/);
 });
 it('opens archived hashes and flagged rows and links in new tabs only',()=>{
  const html=render({...ok,payload:{...ok.payload,source:{...ok.payload.source,evidence_sha256:'[sha]'}},extras:{evidence_href:'/proof',links:[{label:'Raw',href:'/raw',newTab:true},{label:'Local',href:'/local'}],rows:{source:[{key:'extra',label:'Extra',value:'Extra',href:'/extra',newTab:true}]}}});
  for(const href of ['/proof','/raw','/extra'])expect(html.match(new RegExp('<a[^>]*href="'+href+'"[^>]*>'))?.[0]).toContain('target="_blank" rel="noopener noreferrer"');
  for(const href of ['/local','/module/[id]'])expect([...html.matchAll(/<a[^>]*>/g)].filter(m=>m[0].includes('href="'+href+'"')).every(m=>!m[0].includes('target='))).toBe(true);
 });
 it('marks judgments and renders revision history',()=>{const html=render({variant:'ok',payload:payload('judgment'),extras:{revisions:[{period:'[period]',value:'4.2',available:'[at]',version:'v1',current:true}]}});expect(html).toContain(messages.marks.judgment);expect(html).toContain('aria-current="true"');});
});

// Exercise modal event handlers and clipboard state without a browser dependency.
it('focuses close, traps both Tab directions, closes by Escape/backdrop and restores opener',async()=>{
 const {act}=await import('react');const {create}=await import('react-test-renderer');const {vi}=await import('vitest');
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const doc:{activeElement:unknown}={activeElement:null};
 class Element {isConnected=true;focus=vi.fn(()=>{doc.activeElement=this;});getClientRects(){return [1];}}
 const opener=new Element(),first=new Element(),last=new Element();doc.activeElement=opener;
 vi.stubGlobal('document',doc);vi.stubGlobal('HTMLElement',Element);
 const close=vi.fn();let root:ReturnType<typeof create>|undefined;
 try{
  await act(async()=>{root=create(h(NextIntlClientProvider,{locale:'en',messages:{research:en},children:h(SourceDrawer,{input:ok,onClose:close})}),{createNodeMock:element=>element.type==='button'?first:(element.props as {role?:string}).role==='dialog'?{querySelectorAll:()=>[first,last],contains:(node:unknown)=>node===first||node===last}:null});});
  expect(first.focus).toHaveBeenCalledOnce();
  const key=root!.root.findByProps({className:'fixed inset-0 z-[60] flex sm:justify-end'}).props.onKeyDown;
  const preventDefault=vi.fn();key({key:'Tab',shiftKey:true,preventDefault});expect(last.focus).toHaveBeenCalledOnce();
  key({key:'Tab',shiftKey:false,preventDefault});expect(first.focus).toHaveBeenCalledTimes(2);expect(preventDefault).toHaveBeenCalledTimes(2);
  key({key:'Escape',stopPropagation:vi.fn()});expect(close).toHaveBeenCalledOnce();
  root!.root.findAllByType('div').find(node=>node.props['aria-hidden']==='true')!.props.onClick();expect(close).toHaveBeenCalledTimes(2);
  await act(async()=>{root!.unmount();});root=undefined;expect(opener.focus).toHaveBeenCalledOnce();
 }finally{if(root)await act(async()=>root!.unmount());vi.unstubAllGlobals();}
});
it('copies hashes only on success, keeps denied writes retryable and resets on reopening',async()=>{
 const {act}=await import('react');const {create}=await import('react-test-renderer');const {vi}=await import('vitest');
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('HTMLElement',class {});
 const writeText=vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}});
 const input:SourceDrawerInput={variant:'ok',payload:{...payload('macro_observation'),source:{...payload('macro_observation').source,evidence_sha256:'[sha]'}}};
 const render=(value:SourceDrawerInput|null)=>h(NextIntlClientProvider,{locale:'en',messages:{research:en},children:h(SourceDrawer,{input:value,onClose:()=>{}})});
 let root:ReturnType<typeof create>|undefined;
 try{
  await act(async()=>{root=create(render(input));});
  const copy=()=>root!.root.findAllByType('button').find(b=>b.props.children==='Copy hash')!;
  await act(async()=>{await copy().props.onClick();});expect(copy()).toBeTruthy();
  await act(async()=>{await copy().props.onClick();});expect(writeText).toHaveBeenLastCalledWith('[sha]');expect(root!.root.findAllByType('button').filter(b=>b.props.children==='Copied')).toHaveLength(2);
  await act(async()=>{root!.update(render(null));});await act(async()=>{root!.update(render(input));});expect(copy()).toBeTruthy();
  vi.stubGlobal('navigator',{});await act(async()=>{await copy().props.onClick();});expect(copy()).toBeTruthy();
 }finally{if(root)await act(async()=>root!.unmount());vi.unstubAllGlobals();}
});
