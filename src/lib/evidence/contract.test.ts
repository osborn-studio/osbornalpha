// Topic spec §4.1 resolver tests.
// src/lib/evidence/contract.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memorySources} from './memory-sources';
import {allFixtures,SAMPLES} from './fixtures';
import {EVIDENCE_KINDS} from './ref';
import {macroResolver} from './resolvers/macro';import {industryResolver} from './resolvers/industry';import {factResolver} from './resolvers/fact';
import {citationResolver} from './resolvers/citation';import {judgmentResolver} from './resolvers/judgment';import {brokerResolver} from './resolvers/broker';
const pub={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
const build=()=>{const s=memorySources(allFixtures());return {s,list:[macroResolver(s),industryResolver(s),factResolver(s),citationResolver(s),judgmentResolver(s),brokerResolver()]};};
it('registers one resolver per kind of the contract',()=>{expect(build().list.map(r=>r.kind).sort()).toEqual([...EVIDENCE_KINDS].sort());});
describe.each(build().list.map(r=>[r.kind] as const))('%s resolver contract',kind=>{
 const refs=SAMPLES[kind];   // per kind: every state the kind can produce, in a fixed order
 const get=()=>{const b=build();return {s:b.s,r:b.list.find(x=>x.kind===kind)!};};
 it('rule 1: same length, same order',async()=>{expect((await get().r.resolve(refs.map(x=>x.ref),pub)).map(x=>x.ref)).toEqual(refs.map(x=>x.ref));});
 it('produces exactly the states of the spec table',async()=>{
  expect((await get().r.resolve(refs.map(x=>x.ref),pub)).map(x=>`${x.state}:${x.reason}`)).toEqual(refs.map(x=>x.expect));
 });
 it('rule 3: fact, digest and payload are null unless ok; restricted values never serialise',async()=>{
  for(const [i,x] of (await get().r.resolve(refs.map(y=>y.ref),pub)).entries()){
   expect(x.digest===null,`digest ${i}`).toBe(x.state!=='ok');expect(x.display.fact===null,`fact ${i}`).toBe(x.state!=='ok');
   expect(x.admin_only).toBeUndefined();
   for(const secret of refs[i].secrets??[])expect(JSON.stringify(x)).not.toContain(secret);
  }
 });
 it('rule 6: resolving writes nothing',async()=>{
  const {s,r}=get();const before=JSON.stringify(s.seed);await r.resolve(refs.map(x=>x.ref),pub);await r.resolve(refs.map(x=>x.ref),{...pub,audience:'admin'});
  expect(JSON.stringify(s.seed)).toBe(before);
 });
 it('rule 7: digests repeat',async()=>{
  const {r}=get();const a=await r.resolve(refs.map(x=>x.ref),pub),b=await r.resolve(refs.map(x=>x.ref),pub);
  expect(a.map(x=>x.digest)).toEqual(b.map(x=>x.digest));
 });
});
it('A8: a broker ref is unsupported',async()=>{
 const [out]=await brokerResolver().resolve([SAMPLES.broker_report_meta[0].ref],pub);
 expect([out.state,out.reason]).toEqual(['unsupported','foreign_research_not_wired']);
});
it('rule 5: no resolver module imports another resolver',async()=>{
 const {readFileSync,readdirSync}=await vi.importActual<typeof import('node:fs')>('node:fs');
 for(const f of readdirSync('src/lib/evidence/resolvers').filter(n=>!n.endsWith('.test.ts')))
  expect(readFileSync(`src/lib/evidence/resolvers/${f}`,'utf8'),f).not.toMatch(/from '\.\/(macro|industry|fact|citation|judgment|broker)'/);
});
it('private citations and non-publishable methods stay withheld for admins',async()=>{
 const b=build();
 for(const kind of ['document_citation','judgment'] as const){
  const refs=SAMPLES[kind].filter(s=>s.expect.startsWith('withheld:'));
  const resolved=await b.list.find(r=>r.kind===kind)!.resolve(refs.map(s=>s.ref),{...pub,audience:'admin'});
  expect(resolved.map(r=>`${r.state}:${r.reason}`)).toEqual(refs.map(s=>s.expect));
  for(const r of resolved){expect(r.admin_only).toBeUndefined();expect(r.display.fact).toBeNull();expect(r.digest).toBeNull();}
 }
});
it('places a public citation snippet only in the drawer locator',async()=>{
 const {s,list}=build(),r=list.find(r=>r.kind==='document_citation')!;
 const ref=SAMPLES.document_citation[0].ref,c=s.seed.documents.citations.find(c=>c.citation_id===ref.id)!;
 const [out]=await r.resolve([ref],pub);
 expect(out.display.fact).toEqual({template:'topic.citation',slots:{title:c.document.title,page:String(c.page_no)}});
 expect(out.drawer).toMatchObject({source:{locator:`p.${c.page_no} · ${c.snippet}`}});
 expect(JSON.stringify({...out,drawer:null})).not.toContain(c.snippet);
 c.document.permission='private';
 expect(await r.latestIdentity(ref)).toMatchObject({state:'withheld',reason:'private_document',value:null});
});
