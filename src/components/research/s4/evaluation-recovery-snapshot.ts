/** Bounded exact JSON snapshot of damaged local state. Unsupported values fail
 * closed; never equate holes/undefined, -0/0, exotic objects or cyclic graphs.
 * Snapshot stays local and must never be sent to the recovery endpoint.
 */
export function recoverySnapshot(value:unknown):string{
 let nodes=0,chars=0;const seen=new WeakSet<object>();
 const invalid=()=>{throw Error('evaluation_journal_unavailable');};
 const text=(s:string)=>{chars+=s.length;if(chars>8192)invalid();return JSON.stringify(s);};
 const encode=(v:unknown,depth:number):string=>{
  if(++nodes>256||depth>8)invalid();
  if(v===null)return 'null';if(typeof v==='string')return text(v);if(typeof v==='boolean')return String(v);
  if(typeof v==='number'){if(!Number.isFinite(v)||Object.is(v,-0))invalid();return String(v);}
  if(typeof v!=='object'||!v) return invalid();
  if(seen.has(v))invalid();seen.add(v);
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
  if(keys.some(k=>typeof k!=='string'))invalid();
  if(Array.isArray(v)){
   if(v.length>256||keys.length!==v.length+1)return invalid();
   const parts:string[]=[];
   for(let n=0;n<v.length;n++){const d=descriptors[String(n)];if(!d||!('value' in d))return invalid();parts.push(encode(d.value,depth+1));}
   return '['+parts.join(',')+']';
  }
  if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)return invalid();
  return '{'+(keys as string[]).sort().map(k=>{const d=descriptors[k];if(!('value' in d)||!d.enumerable)return invalid();return text(k)+':'+encode(d.value,depth+1);}).join(',')+'}';
 };
 const result=encode(value,0);if(new TextEncoder().encode(result).length>8192)invalid();return result;
}
