import type {DraftEntry} from './types';
export const EXCERPT_CAPS={zhChars:120,enWords:60,fragments:3} as const;
export function httpsUrl(value:string){
 try{return value.startsWith('https://')&&new URL(value).protocol==='https:';}catch{return false;}
}
export function validDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const timestamp=Date.parse(value);
 return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
}
export function fragmentLength(text:string){
 return {zhChars:(text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)??[]).length,
  enWords:(text.match(/[\p{Script=Latin}\d]+(?:['’][\p{Script=Latin}\d]+)*/gu)??[]).length};
}
type Excerpt=Extract<DraftEntry,{entry_type:'licensed_excerpt'}>;
// Display requires an approved licence with explicit excerpt permission. Licences have no validity dates.
export function excerptPermitted(licence:{status:string;permits:Record<string,unknown>}|undefined):boolean{
 return licence?.status==='approved'&&licence.permits.display_excerpt===true;
}
export function excerptViolations(entry:Excerpt,licence:{status:string;permits:Record<string,unknown>}|undefined){
 if(!excerptPermitted(licence)||!entry.fragments.length||entry.fragments.length>EXCERPT_CAPS.fragments)return ['excerpt_violation'];
 const invalid=entry.fragments.some(f=>{
  const {zhChars,enWords}=fragmentLength(f.text);
  return !f.text.trim()||zhChars>EXCERPT_CAPS.zhChars||enWords>EXCERPT_CAPS.enWords||!f.attribution.trim()||!validDate(f.date)||!httpsUrl(f.url);
 });
 return invalid?['excerpt_violation']:[];
}
export type PublicEntry=DraftEntry|{key:string;entry_type:'licensed_excerpt';masked:true;reason:'licence_revoked';attributions:{attribution:string;url:string}[]};
export function maskExcerpts(entries:PublicEntry[],allowed:ReadonlyMap<string,boolean>):PublicEntry[]{
 return entries.map(e=>!('masked' in e)&&e.entry_type==='licensed_excerpt'&&allowed.get(e.licence_id)!==true?
  {key:e.key,entry_type:e.entry_type,masked:true,reason:'licence_revoked',attributions:e.fragments.map(({attribution,url})=>({attribution,url}))}:structuredClone(e));
}
