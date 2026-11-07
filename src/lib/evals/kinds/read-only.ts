// src/lib/evals/kinds/read-only.ts
// Reflection check for injected read dependencies (spec §5.4(b), §0 R5-10): walks own properties, the
// prototype chain (class methods) and nested plain-object values (cycle-safe, depth ≤ 4, getters are
// never invoked) and reports every property whose name starts with insert / update / upsert / store /
// delete / rpc followed by a word boundary (end, '_' or an upper-case letter: insertRun, upsert_row,
// storeX — but not storage, updated_at, inserted).
import {EvalError} from '../errors';
import type {EvalErrorCode} from '../errors';

const WRITE_NAME=/^(insert|update|upsert|store|delete|rpc)(?:[A-Z_]|$)/;

export function writeLikeProperties(root:unknown,maxDepth=4):string[]{
 const found=new Set<string>();const seen=new WeakSet<object>();
 const walk=(v:unknown,path:string,depth:number):void=>{
  if(v===null||(typeof v!=='object'&&typeof v!=='function'))return;
  const o=v as object;
  if(seen.has(o)||depth>maxDepth)return;
  seen.add(o);
  for(let p:object|null=o;p!==null&&p!==Object.prototype&&p!==Function.prototype;p=Object.getPrototypeOf(p)){
   for(const k of Reflect.ownKeys(p)){
    if(typeof k!=='string'||k==='constructor')continue;
    const name=path?`${path}.${k}`:k;
    if(WRITE_NAME.test(k))found.add(name);
    const d=Object.getOwnPropertyDescriptor(p,k);
    if(d&&'value' in d&&typeof d.value==='object'&&d.value!==null)walk(d.value,name,depth+1);
   }
  }
 };
 walk(root,'',0);
 return [...found].sort();
}

export function assertReadOnly(root:unknown,code:EvalErrorCode,label:string):void{
 const props=writeLikeProperties(root);
 if(props.length>0)throw new EvalError(code,`${label} exposes write-capable properties: ${props.join(', ')}`,{properties:props});
}
