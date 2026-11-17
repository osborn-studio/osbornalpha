import type {IssuerIndustriesView} from '@/lib/industry/read';
import type {FetchState} from '@/lib/company/fetch-state';

export function industryUrl(issuerId:string|null,market:string|null,asOf:string|null):string|null {
  return issuerId && market==='US' ? `/api/entities/${encodeURIComponent(issuerId)}/industries${asOf?`?on=${encodeURIComponent(asOf)}`:''}` : null;
}
type IndustryChip = {kind:'none'|'notServed'|'withheld'|'missing'|'loading'|'error'} | {kind:'link';href:string;code:string;name:string};
export function industryChip(issuerId:string|null,market:string|null,state:FetchState<IssuerIndustriesView>,locale:'zh'|'en'):IndustryChip {
  if(!issuerId) return {kind:'none'};
  if(market!=='US') return {kind:'notServed'};
  if(state.status==='idle'||state.status==='loading') return {kind:'loading'};
  if(state.status==='error'||state.data.state==='unknown_issuer') return {kind:'error'};
  if(state.data.schemes.some(s=>s.scheme==='sic'&&!s.public)) return {kind:'withheld'};
  const node=state.data.industries.find(i=>i.scheme==='sic')?.path.at(-1);
  if(!node) return {kind:'missing'};
  return {kind:'link',href:`/intel/industries/sic/${encodeURIComponent(node.code)}`,code:node.code,name:(locale==='zh'?node.nameZh??node.nameEn:node.nameEn??node.nameZh)??''};
}
