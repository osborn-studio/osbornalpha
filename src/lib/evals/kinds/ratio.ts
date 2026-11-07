// src/lib/evals/kinds/ratio.ts
// Exact non-negative ratio as decimal text for reports (display only, never compared): num/den truncated
// toward zero to `places` digits on BigInt, canonical form (no trailing zeros).
import {canonicalDecimal} from '../../facts/json-numbers';

export function ratioText(num:bigint,den:bigint,places=10):string{
 if(num<0n||den<=0n)throw new RangeError('ratioText: needs num >= 0 and den > 0');
 const q=(num*10n**BigInt(places))/den;
 const s=q.toString().padStart(places+1,'0');
 return canonicalDecimal(places===0?s:`${s.slice(0,-places)}.${s.slice(-places)}`);
}
