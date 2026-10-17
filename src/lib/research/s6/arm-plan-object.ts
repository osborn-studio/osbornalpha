import {types} from 'node:util';
import {fail} from '../ingest/pa-v1/json.js';
/** Exact plain own-data fields. Reject Proxy traps and accessors before invoking them. */
export function exactPlanObject(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('invalid_schema');
 const ownKeys=Reflect.ownKeys(value as object);
 if(ownKeys.length!==keys.length||ownKeys.some(k=>typeof k!=='string'||!keys.includes(k)))fail('invalid_schema');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).length!==keys.length||keys.some(k=>!descriptors[k]||!('value' in descriptors[k])||!descriptors[k].enumerable))fail('invalid_schema');
 return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
}
