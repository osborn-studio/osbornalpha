// macro i18n domain (spec §10): zh/en key and placeholder parity, registration, judgment-off vocabulary.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const load=(l:'zh'|'en')=>JSON.parse(readFileSync(resolve(process.cwd(),'messages',l,'macro.json'),'utf8'));
function flat(v:unknown,p=''):[string,string][]{
 if(typeof v==='string')return [[p,v]];
 if(typeof v!=='object'||v===null||Array.isArray(v))throw new Error(`non-string message at ${p}`);
 return Object.entries(v).flatMap(([k,c])=>flat(c,p?`${p}.${k}`:k));
}
const ph=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).sort();
describe('macro messages',()=>{
 it('zh and en have the same keys',()=>{
  expect(flat(load('zh')).map(([k])=>k).sort()).toEqual(flat(load('en')).map(([k])=>k).sort());
 });
 it('placeholders match per key',()=>{
  const en=new Map(flat(load('en')));
  for(const [k,v] of flat(load('zh')))expect([k,ph(v)]).toEqual([k,ph(en.get(k)!)]);
 });
 it('copy outside the judgment slot never uses judgment vocabulary',()=>{
  for(const [k,v] of flat(load('zh')).filter(([k])=>!k.startsWith('judgment.')))expect([k,/象限|得分|margin|概率|置信度/.test(v)]).toEqual([k,false]);
  for(const [k,v] of flat(load('en')).filter(([k])=>!k.startsWith('judgment.')))expect([k,/quadrant|score|margin|probabilit|confidence/i.test(v)]).toEqual([k,false]);
 });
 it('is registered in MESSAGE_DOMAINS inside a MACRO block',()=>{
  expect(readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8')).toMatch(/\/\/ MACRO[\s\S]*'macro'[\s\S]*\/\/ \/MACRO/);
 });
});
