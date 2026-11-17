// Foreign research domain keys and ICU parameters must match in both locales.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
type Tree={[k:string]:string|Tree};
const load=(l:'zh'|'en')=>JSON.parse(readFileSync(resolve(process.cwd(),'messages',l,'foreign-research.json'),'utf8')) as Tree;
const flat=(t:Tree,p=''):[string,string][]=>Object.entries(t).flatMap(([k,v])=>typeof v==='string'?[[p+k,v] as [string,string]]:flat(v,`${p}${k}.`));
const ph=(s:string)=>[...s.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort();
describe('foreign research messages',()=>{
 it('has identical keys',()=>{expect(flat(load('zh')).map(([k])=>k).sort()).toEqual(flat(load('en')).map(([k])=>k).sort());});
 it('has identical ICU placeholders',()=>{const en=new Map(flat(load('en')));for(const [k,v] of flat(load('zh')))expect(ph(v),k).toEqual(ph(en.get(k)??''));});
 it('has no empty translations',()=>{for(const l of ['zh','en'] as const)for(const [k,v] of flat(load(l)))expect(v.trim(),`${l}:${k}`).not.toBe('');});
 it('is registered inside the FOREIGN fence',()=>{expect(readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8')).toMatch(/\/\/ FOREIGN ↓[^\n]*\n\s*'foreign-research',\n\s*\/\/ FOREIGN ↑/);});
});
