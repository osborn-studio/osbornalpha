// src/lib/facts/json-numbers.ts
// Lossless numeric decoding (spec §6.2, audit N8/R3-7). JSON.parse would turn a 20-digit integer
// or 1e5 into a double, so scanJsonNumbers first rewrites every numeric literal outside strings
// into {"__num":"<literal>"} and parses that. decodeWithSchema then decodes by field name:
// control fields (cik, fy, code, has_more, report_type, …) → integer JS number; decimal fields
// (val, statement value columns) → canonicalDecimal string, inserted into numeric as text;
// any other numeric field → JS number. Equality of values is always on the canonical form.
export interface NumToken{__num:string}
export const isNumToken=(v:unknown):v is NumToken=>typeof v==='object'&&v!==null&&typeof (v as NumToken).__num==='string'&&Object.keys(v as object).length===1;

const TOKEN=/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const JSON_INT=/^-?(?:0|[1-9]\d*)(?![\d])/;
/** True when the string token at [end) is followed by optional JSON whitespace and ':' (i.e. it is an object key). */
function isKeyAt(text:string,end:number):boolean{
 for(let i=end;i<text.length;i++){
  const c=text.charCodeAt(i);
  if(c===32||c===9||c===10||c===13)continue;
  return c===58;
 }
 return false;
}
/**
 * JSON.parse with every numeric literal wrapped as {__num:'<original text>'}. Strings are left intact.
 * The input is first validated with a plain JSON.parse (malformed text fails fast, before the regex pass), and
 * fails closed if an object key decodes to the reserved marker `__num` (also in escaped spellings).
 */
export function scanJsonNumbers(input:Uint8Array|string):unknown{
 const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
 JSON.parse(text);
 const rewritten=text.replace(TOKEN,(m,offset:number)=>{
  if(m.charCodeAt(0)===34){
   // only a string that could decode to '__num' (7..64 chars, starts with '"_' or has an escape) is parsed
   if(m.length>=7&&m.length<=64&&(m.charCodeAt(1)===95||m.includes('\\'))&&isKeyAt(text,offset+m.length)&&JSON.parse(m)==='__num')throw new Error('reserved_key:__num');
   return m;
  }
  if(!JSON_INT.test(m))throw new Error(`invalid_json_number:${m.slice(0,40)}`);
  return `{"__num":"${m}"}`;
 });
 return JSON.parse(rewritten);
}

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
/** Raw-input cap, exponent cap and output cap are chosen together: every accepted output is <= MAX_LITERAL chars, so canonicalDecimal is idempotent. */
const MAX_LITERAL=512;
const MAX_EXPONENT=200;
/** Canonical decimal text: no exponent, no leading/trailing zeros, '-0' → '0'. Throws invalid_decimal. */
export function canonicalDecimal(raw:string):string{
 if(raw.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 const m=DECIMAL.exec(raw);
 if(!m)throw new Error(`invalid_decimal:${raw.slice(0,40)}`);
 const exp=m[4]===undefined?0:Number(m[4]);
 if(!Number.isSafeInteger(exp)||Math.abs(exp)>MAX_EXPONENT)throw new Error('invalid_decimal:exponent');
 const digits=m[2]+(m[3]??'');
 const point=m[2].length+exp;
 let intPart:string,fracPart:string;
 if(point<=0){intPart='0';fracPart='0'.repeat(-point)+digits;}
 else if(point>=digits.length){intPart=digits+'0'.repeat(point-digits.length);fracPart='';}
 else{intPart=digits.slice(0,point);fracPart=digits.slice(point);}
 intPart=intPart.replace(/^0+(?=\d)/,'');
 let end=fracPart.length;
 while(end>0&&fracPart.charCodeAt(end-1)===48)end--;
 fracPart=fracPart.slice(0,end);
 const zero=intPart==='0'&&fracPart==='';
 const out=`${m[1]==='-'&&!zero?'-':''}${intPart}${fracPart?`.${fracPart}`:''}`;
 if(out.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 return out;
}
export const decimalEquals=(a:string,b:string):boolean=>canonicalDecimal(a)===canonicalDecimal(b);

export interface NumberSchema{control:readonly string[];decimal:readonly string[]}
export const EDGAR_NUMBER_SCHEMA:NumberSchema={control:['cik','fy'],decimal:['val']};
/** Tushare control columns; the adapter adds the statement's value columns as `decimal`. */
export const TUSHARE_CONTROL_FIELDS:readonly string[]=['code','has_more','report_type','comp_type','is_calc','update_flag','end_type'];

export function decodeNumber(raw:string,mode:'control'|'decimal'|'number',field:string|null):string|number{
 if(mode==='decimal')return canonicalDecimal(raw);
 if(mode==='control'){
  // integrality on the exact decimal text first; Number() would round 1.00000000000000001 to 1 and 1e-400 to 0
  let canon:string;
  try{canon=canonicalDecimal(raw);}catch{throw new Error(`invalid_control_field:${field??''}`);}
  const n=Number(canon);
  if(!/^-?\d+$/.test(canon)||!Number.isSafeInteger(n))throw new Error(`invalid_control_field:${field??''}`);
  return n;
 }
 return Number(raw);
}
const modeOf=(schema:NumberSchema,field:string|null)=>field!==null&&schema.decimal.includes(field)?'decimal':field!==null&&schema.control.includes(field)?'control':'number';

/** Walks a scanJsonNumbers result and decodes every NumToken by the name of its nearest enclosing field. */
export function decodeWithSchema(value:unknown,schema:NumberSchema,field:string|null=null):unknown{
 if(isNumToken(value))return decodeNumber(value.__num,modeOf(schema,field),field);
 if(Array.isArray(value))return value.map(v=>decodeWithSchema(v,schema,field));
 if(value!==null&&typeof value==='object'){
  // fromEntries defines own properties, so a '__proto__' key stays data and never touches the prototype
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[k,decodeWithSchema(v,schema,k)]));
 }
 return value;
}

/** Positional rows (Tushare items) → objects keyed by `fields`, each cell decoded by its column name. */
export function decodeColumns(fields:string[],items:unknown[][],schema:NumberSchema):Record<string,unknown>[]{
 return items.map(row=>{
  if(row.length!==fields.length)throw new Error(`invalid_row_width:${row.length}`);
  return Object.fromEntries(fields.map((f,i)=>[f,decodeWithSchema(row[i],schema,f)]));
 });
}
