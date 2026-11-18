// Dossier model (topic spec §7.2, X22).
import {describe,expect,it} from 'vitest';
import {readTopic} from '@/lib/topics/public-read';
import {publishedFixture} from '@/lib/topics/fixtures/published';
import {dossierModel} from './dossier-model';
const fixture=()=>readTopic({preview:false,db:publishedFixture().db,now:()=>new Date('2026-11-15T00:00:00Z')},'rates-and-banks',{});
describe('dossier model',()=>{
 it('selects one banner for the requested view',async()=>{
  const dto=await fixture();
  expect(dossierModel(dto,'zh').banner).toBeNull();
  dto.version.superseded=true;dto.current_version_no=3;
  expect(dossierModel(dto,'zh').banner).toBeNull();
  dto.view='version';expect(dossierModel(dto,'zh').banner).toEqual({kind:'superseded',current:3});
  dto.view='replay';dto.replay_as_of='2026-11-10';
  expect(dossierModel(dto,'zh').banner).toEqual({kind:'replay',asOf:'2026-11-10'});
  dto.version.unpublished_at='2026-11-14';dto.version.unpublish_reason='licence';
  expect(dossierModel(dto,'zh').banner).toEqual({kind:'unpublished',reason:'licence'});
  expect(dossierModel(dto,'zh').sections).toEqual([]);
 });
 it('localizes the frame and splits ordered facts from judgments and resolves expected slots',async()=>{
  const dto=await fixture();dto.evidence.reverse();
  const m=dossierModel(dto,'en');
  expect(m).toMatchObject({breadcrumb:['Topic research','Macro'],title:'Rates and banks',dek:'Public evidence and research notes',entries:dto.entries});
  expect(m.footer).toMatchObject({counts:dto.counts,stale:dto.stale});
  expect(m.sections[0]).toMatchObject({key:'s1',title:'Evidence',chart:null});
  expect(m.sections[0].rows.map(e=>e.ordinal)).toEqual([1,2,3,4]);
  expect(m.sections[0].rows.every(e=>e.kind!=='judgment')).toBe(true);
  expect(m.sections[0].judgments.map(e=>e.ordinal)).toEqual([5]);
  expect(m.sections[0].judgments.every(e=>e.kind==='judgment')).toBe(true);
  expect(m.sections[0].slots).toEqual(dto.expected_slots);
 });
 it('renders note slots using formatted facts and suppresses masked values and periods',async()=>{
  const dto=await fixture();dto.sections[0].note={zh:'值 {{ev:1}}，期 {{ev:2.period}}',en:'Value {{ev:1}}; period {{ev:2.period}}'};
  expect(dossierModel(dto,'zh').sections[0].noteParts).toEqual([{type:'text',text:'值 '},{type:'slot',ordinal:1,part:'value',state:'ok',text:'3.75%'},{type:'text',text:'，期 '},{type:'slot',ordinal:2,part:'period',state:'ok',text:'2026-09-30'}]);
  dto.evidence[0].masked=true;dto.evidence[1].masked=true;
  expect(dossierModel(dto,'en').sections[0].noteParts.filter(p=>p.type==='slot').map(p=>p.text)).toEqual([null,null]);
 });
});

// Exercise the real read service through the page's auth and error mapping.
import {beforeEach,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import topics from '../../../../messages/en/topics.json';
import research from '../../../../messages/en/research.json';
import type {PublicDeps} from '@/lib/topics/deps';
import {DossierView} from './DossierView';
const gates=vi.hoisted(()=>({enabled:true,fixture:true,admin:false,authenticated:true,public:vi.fn(),preview:vi.fn()}));
vi.mock('@/lib/topics/flags',()=>({topicsEnabled:()=>gates.enabled}));
vi.mock('@/lib/topics/e2e-fixture',()=>({fixtureMode:()=>gates.fixture}));
vi.mock('@/lib/topics/deps',()=>({publicDeps:gates.public,previewDeps:gates.preview}));
vi.mock('@/lib/admin/auth',()=>{
 class AdminForbidden extends Error{}class AdminUnauthenticated extends Error{}
 return {AdminForbidden,AdminUnauthenticated,requireAdminUser:async()=>{if(!gates.authenticated)throw new AdminUnauthenticated();if(!gates.admin)throw new AdminForbidden();}};
});
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NEXT_NOT_FOUND');},redirect:(href:string)=>{throw new Error(`NEXT_REDIRECT:${href}`);},useRouter:()=>({push:vi.fn()})}));
import TopicDossierPage from '@/app/(app)/intel/topics/[slug]/page';
import TopicVersionPage from '@/app/(app)/intel/topics/[slug]/v/[n]/page';
const request=(asOf?:string)=>({params:Promise.resolve({slug:'rates-and-banks'}),searchParams:Promise.resolve(asOf?{asOf}:{})});
const html=(child:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{topics,research},children:child}));
describe('dossier page gates and frame',()=>{
 let f:ReturnType<typeof publishedFixture>,deps:PublicDeps;
 beforeEach(()=>{
  f=publishedFixture();deps={db:f.db,now:()=>new Date('2026-11-15T00:00:00Z'),preview:false};
  gates.enabled=true;gates.fixture=true;gates.admin=false;gates.authenticated=true;
  gates.public.mockReset().mockResolvedValue(deps);gates.preview.mockReset().mockImplementation(()=>({...deps,db:publishedFixture().db,preview:true}));
 });
 it('closes at the environment gate before reading dependencies',async()=>{
  gates.enabled=false;await expect(TopicDossierPage(request())).rejects.toThrow('NEXT_NOT_FOUND');expect(gates.public).not.toHaveBeenCalled();
 });
 it('keeps fixture visitors non-admin and closes the directory switch',async()=>{
  f.db.setPublicFlag(false);await expect(TopicDossierPage(request())).rejects.toThrow('NEXT_NOT_FOUND');expect(gates.preview).not.toHaveBeenCalled();
 });
 it('uses admin preview only after authentication when the directory is closed',async()=>{
  gates.fixture=false;gates.admin=true;f.db.setPublicFlag(false);
  const page=await TopicDossierPage(request());expect(page.props).toMatchObject({isAdmin:true,preview:true,dto:{view:'current'}});
  expect(gates.preview).toHaveBeenCalledOnce();expect(html(page)).toContain('Directory not public');
 });
 it('redirects unauthenticated readers and permits signed-in non-admin readers',async()=>{
  gates.fixture=false;gates.authenticated=false;
  await expect(TopicDossierPage(request())).rejects.toThrow('NEXT_REDIRECT:/login?next=');
  gates.authenticated=true;expect((await TopicDossierPage(request())).props.isAdmin).toBe(false);
 });
 it('routes explicit versions and replay through readTopic',async()=>{
  const page=await TopicVersionPage({params:Promise.resolve({slug:'rates-and-banks',n:'1'}),searchParams:Promise.resolve({})});
  expect(page.props.dto).toMatchObject({view:'version',version:{version_no:1}});expect(html(page)).toContain('data-dossier-banner="superseded"');
  const replay=await TopicDossierPage(request('2026-11-02'));expect(replay.props.dto).toMatchObject({view:'replay',version:{version_no:1}});
  expect(html(replay)).toContain('data-dossier-banner="replay"');expect(html(replay)).not.toContain('data-dossier-banner="superseded"');
 });
 it('renders an empty replay frame before first publication',async()=>{
  const page=await TopicDossierPage(request('2026-10-01'));expect(page.props).toMatchObject({dto:null,failure:{kind:'no_version',asOf:'2026-10-01'}});
  expect(html(page)).toContain('No published version existed on this date');expect(html(page)).not.toContain('data-evidence-ordinal');
 });
 it('renders unpublished and retired frames without any evidence',async()=>{
  await f.unpublishCurrent('rates-and-banks','licence');
  const page=await TopicVersionPage({params:Promise.resolve({slug:'rates-and-banks',n:'2'}),searchParams:Promise.resolve({})});
  expect(page.props).toMatchObject({dto:null,failure:{kind:'unpublished',version:2,reason:'licence'}});
  expect(html(page)).toContain('v2 has been unpublished');expect(html(page)).not.toContain('data-evidence-ordinal');
  await f.retire('rates-and-banks','privacy');const retired=await TopicDossierPage(request());
  expect(retired.props).toMatchObject({dto:null,failure:{kind:'retired',reason:'privacy'}});expect(html(retired)).not.toContain('data-evidence-ordinal');
 });
 it('rejects unknown slugs and invalid versions',async()=>{
  await expect(TopicDossierPage({...request(),params:Promise.resolve({slug:'absent'})})).rejects.toThrow('NEXT_NOT_FOUND');
  await expect(TopicVersionPage({params:Promise.resolve({slug:'rates-and-banks',n:'1x'}),searchParams:Promise.resolve({})})).rejects.toThrow('NEXT_NOT_FOUND');
 });
 it('renders facts separately from judgment cards and leaves later mount points empty',async()=>{
  const dto=await readTopic(deps,'rates-and-banks',{});
  const out=html(createElement(DossierView,{dto,versions:[dto.version],slug:dto.topic.slug,isAdmin:false,today:'2026-11-15'}));
  expect(out).toContain('data-evidence-ordinal="5"');expect(out.indexOf('data-evidence-ordinal="5"')).toBeGreaterThan(out.indexOf('</table>'));
  expect(out).toContain('data-expected-slot="industry"');expect(out).toContain('data-research-state="reconstructed"');
  expect(out).not.toContain('Manage versions');expect(out).not.toContain('Record changes in public evidence.');
 });
});
