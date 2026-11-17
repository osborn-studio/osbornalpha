import {createHash} from 'node:crypto';
const namespace=Buffer.from('6f0c3d0e9a2b4c8e8d4f1b2c3d4e5f60','hex');
/** RFC 4122 §4.3 UUID v5: namespace bytes + UTF-8 name, SHA-1, version/variant bits. */
export function presetRequestId(id:string):string{
 const bytes=createHash('sha1').update(namespace).update(id,'utf8').digest().subarray(0,16);
 bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;
 const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
