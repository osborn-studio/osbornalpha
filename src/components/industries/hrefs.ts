// src/components/industries/hrefs.ts
// URL builders of the industry pages (search params carry every selector, spec §8.2) and the
// locale rule for node names: SW publishes no English names, so the English UI shows the Chinese name
// plus the code (canvas "Detail" note); SIC has English titles only.
import type {Locale} from '@/lib/industry/display';

export type Search=Record<string,string|undefined>;
export const INDUSTRIES_PATH='/intel/industries';
/** Same path with `patch` applied; undefined or '' removes a key; keys sorted for stable URLs. */
export function hrefWith(path:string,current:Search,patch:Search):string{
 const merged:Search={...current,...patch};
 const qs=Object.keys(merged).sort().filter(k=>merged[k]!==undefined&&merged[k]!=='').map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(merged[k]!)}`).join('&');
 return qs?`${path}?${qs}`:path;
}
export const industryPath=(scheme:string,code:string)=>`${INDUSTRIES_PATH}/${scheme}/${encodeURIComponent(code)}`;
export const constituentsPath=(scheme:string,code:string)=>`${industryPath(scheme,code)}/constituents`;
export const stockPath=(ticker:string)=>`/stock/${encodeURIComponent(ticker)}`;
export function nodeName(n:{code:string;nameZh:string|null;nameEn:string|null},locale:Locale):string{
 return (locale==='en'?n.nameEn??n.nameZh:n.nameZh??n.nameEn)??n.code;
}
export function issuerLabel(i:{nameZh:string|null;nameEn:string|null;ticker:string|null;issuerId:string},locale:Locale):string{
 return (locale==='en'?i.nameEn??i.nameZh:i.nameZh??i.nameEn)??i.ticker??i.issuerId.slice(0,8);
}
/** Flatten Next's searchParams (repeated keys keep the first value: the routes reject repeats, pages tolerate them). */
export function flatSearch(sp:Record<string,string|string[]|undefined>):Search{
 const out:Search={};
 for(const [k,v] of Object.entries(sp))out[k]=Array.isArray(v)?v[0]:v;
 return out;
}
