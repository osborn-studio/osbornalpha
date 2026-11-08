import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import en from '../../../messages/en/industries.json';
import zh from '../../../messages/zh/industries.json';

const h=vi.hoisted(()=>({locale:'en' as 'en'|'zh',state:undefined as unknown,effect:undefined as undefined|(()=>void|(()=>void))}));
vi.mock('react',async importOriginal=>({
 ...await importOriginal<typeof import('react')>(),
 useState:(initial:unknown)=>[h.state??initial,(value:unknown)=>{h.state=value;}],
 useEffect:(effect:()=>void|(()=>void))=>{h.effect=effect;},
}));
vi.mock('next-intl',()=>({useTranslations:(namespace:string)=>(key:string,values?:Record<string,string>)=>{
 const messages=h.locale==='en'?en:zh;
 const template=[...namespace.split('.').slice(1),key].reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],messages) as string;
 return template.replace(/\{(\w+)\}/g,(_,k:string)=>values?.[k]??'');
}}));
import {IndustryEntryCard} from './IndustryEntryCard';

const render=()=>renderToStaticMarkup(createElement(IndustryEntryCard));
const anchors=(html:string)=>[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({url:new URL(m[1].replaceAll('&amp;','&'),'https://example.test'),body:m[2]}));
beforeEach(()=>{h.locale='en';h.state=undefined;h.effect=undefined;});
afterEach(()=>vi.unstubAllGlobals());

describe('industry research entry',()=>{
 it.each(['en','zh'] as const)('offers labelled explicit market/scheme destinations in %s',locale=>{
  h.locale=locale;
  const links=anchors(render());
  expect(links).toHaveLength(2);
  for(const scheme of ['sic','sw2021']){
   const link=links.find(l=>l.url.searchParams.get('scheme')===scheme);
   expect(link,`${scheme} destination`).toBeDefined();
   expect(link!.url.pathname).toBe('/intel/industries');
   expect(link!.url.searchParams.get('metric')).toBe('member_count');
   expect(link!.body).toContain(scheme==='sic'?'SEC SIC':locale==='en'?'SW 2021':'申万 2021');
   expect(link!.body).toContain(scheme==='sic'?(locale==='en'?'US':'美国'):(locale==='en'?'China':'中国'));
  }
  expect(render()).not.toMatch(/valuation percentiles|估值分位/);
 });
 it.each([403,500,'network','fresh'] as const)('keeps SIC independent of SW status: %s',async outcome=>{
  const fetcher=vi.fn((_url:string,_options:{signal:AbortSignal})=>outcome==='network'?Promise.reject(new Error('offline')):Promise.resolve({status:outcome==='fresh'?200:outcome,ok:outcome==='fresh',json:async()=>({factsAsOf:'2026-11-08',freshness:'fresh'})}));
  vi.stubGlobal('fetch',fetcher);
  const before=anchors(render()).find(l=>l.url.searchParams.get('scheme')==='sic');
  const cleanup=h.effect!();
  for(let i=0;i<8;i++)await Promise.resolve();
  const links=anchors(render());
  expect(links.find(l=>l.url.searchParams.get('scheme')==='sic')).toEqual(before);
  const sw=links.find(l=>l.url.searchParams.get('scheme')==='sw2021')!;
  expect(sw).toBeDefined();
  if(outcome===403)expect(sw.body).toContain(en.entry.unlicensed);
  if(outcome==='fresh')expect(sw.body).toContain('2026-11-08');
  expect(fetcher).toHaveBeenCalledWith('/api/industries?scheme=sw2021&metric=member_count&periods=1',expect.objectContaining({signal:expect.any(AbortSignal)}));
  const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
  cleanup?.();
  expect(signal.aborted).toBe(true);
 });
});
