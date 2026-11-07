// src/lib/judgments/uuid-v8.ts
// Content-addressed uuid formatting (RFC 9562 v8), extracted verbatim from ledger.ts judgmentId()
// for the F4 judgment layer (judgment framework spec §2.4 item 5). Version nibble = 8, variant bits
// from hex[16]; the first 128 bits of the digest are kept except hex[12] (replaced by the version).
// Behaviour for every 64-hex input is identical to the former inline code; anything else is refused.
// Lives in src/lib/judgments (F4-owned, plan audit P2-03); src/lib/research/s4/ledger.ts imports it inside its F4 fence.
import {fail} from '../research/ingest/pa-v1/json.js';

const HEX64=/^[0-9a-f]{64}$/;
export function uuidV8(hex64:string):string{
 if(typeof hex64!=='string'||!HEX64.test(hex64))fail('invalid_schema');
 const variant=((parseInt(hex64[16],16)&0x3)|0x8).toString(16);
 return `${hex64.slice(0,8)}-${hex64.slice(8,12)}-8${hex64.slice(13,16)}-${variant}${hex64.slice(17,20)}-${hex64.slice(20,32)}`;
}
