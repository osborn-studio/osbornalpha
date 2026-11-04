// Input normalization shared by the issuer write path. Pure: no DB access.
import {isValidIsin} from '../research/entity-keys/identifiers';

export const isBlank=(v:unknown)=>v==null||(typeof v==='string'&&v.trim()==='');

/** Blank → null; otherwise trimmed, upper-cased and check-digit validated. */
export function normalizeIsin(v:unknown):string|null{
 if(isBlank(v))return null;
 const isin=String(v).trim().toUpperCase();
 if(!isValidIsin(isin))throw new Error('invalid_identifier:isin');
 return isin;
}

/** Blank → null; 1–5 digits padded to the 5-digit HKEX form; anything else is rejected. */
export function normalizeHkexCode(v:unknown):string|null{
 if(isBlank(v))return null;
 const code=String(v).trim();
 if(!/^\d{1,5}$/.test(code))throw new Error('invalid_identifier:hkex');
 return code.padStart(5,'0');
}

/** Trimmed and upper-cased; blank or non-string is rejected. */
export function normalizeTicker(v:unknown):string{
 if(typeof v!=='string'||isBlank(v))throw new Error('invalid_ticker');
 return v.trim().toUpperCase();
}
