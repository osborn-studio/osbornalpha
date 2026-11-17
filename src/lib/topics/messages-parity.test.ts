// src/lib/topics/messages-parity.test.ts
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const load=(l:string,d:string)=>JSON.parse(readFileSync(resolve(process.cwd(),`messages/${l}/${d}.json`),'utf8')) as Record<string,unknown>;
const flat=(o:unknown,p=''):[string,string][]=>typeof o==='string'?[[p,o]]:Object.entries(o as Record<string,unknown>).flatMap(([k,v])=>flat(v,p?`${p}.${k}`:k));
const holes=(s:string)=>[...s.matchAll(/\{(\w+)[,}]/g)].map(m=>m[1]).sort();
const BANNED=/买入|卖出|推荐|增持|减持|目标价|建仓|抄底|\b(buy|sell|recommend|overweight|underweight|target price|accumulate)\b/i;
describe.each(['topics','topicsAdmin'])('%s messages',domain=>{
 const zh=new Map(flat(load('zh',domain))),en=new Map(flat(load('en',domain)));
 it('has identical keys, placeholders and no empty strings',()=>{
  expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());
  for(const [k,v] of zh){expect(v.trim(),k).not.toBe('');expect(en.get(k)!.trim(),k).not.toBe('');expect(holes(v),k).toEqual(holes(en.get(k)!));}
 });
 it('contains no advice wording (spec §3, §13.2)',()=>{
  for(const [k,v] of [...zh,...en])if(!k.startsWith('lint.examples.'))expect(v,k).not.toMatch(BANNED);
 });
});
it('registers both domains inside the TOPICS fence after the FOREIGN fence',()=>{
 expect(readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8')).toMatch(/\/\/ FOREIGN ↑\n\s*\/\/ TOPICS ↓[^\n]*\n\s*'topics', 'topicsAdmin',\n\s*\/\/ TOPICS ↑/);
});
