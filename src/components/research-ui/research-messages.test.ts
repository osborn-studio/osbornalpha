import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
function leaves(value: Record<string, unknown>, prefix=''): string[] {
 return Object.entries(value).flatMap(([key,v])=>typeof v==='object'&&v!==null?leaves(v as Record<string,unknown>,`${prefix}${key}.`):(expect(typeof v).toBe('string'),expect(String(v).trim()).not.toBe(''),[prefix+key])).sort();
}
it('registers complete research catalogs with identical deep key trees',()=>{
 const zh=JSON.parse(read('messages/zh/research.json')); const en=JSON.parse(read('messages/en/research.json'));
 expect(leaves(zh)).toEqual(leaves(en));
 expect(read('src/i18n/request.ts')).toMatch(/\/\/ \/F4\s*\/\/ Research shared foundation \(unified canvas 2026-11-17\)\s*'research'/);
});
