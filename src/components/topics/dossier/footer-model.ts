// Dossier disclosure and source attribution (spec §7.2, D7–D8).
import type {DossierDto,EvidenceDetailDto} from '@/lib/topics/public-dto';
export const COUNT_ORDER=['ok','missing','withheld','not_served','unsupported','retracted'] as const;
export function footerModel(dto:DossierDto&{details?:EvidenceDetailDto[]},text:(key:string)=>string){
 const drawers=(dto.details??[]).flatMap(d=>d.evidence.state==='ok'&&!d.evidence.masked&&d.drawer&&'source' in d.drawer?[d.drawer]:[]);
 return {counts:COUNT_ORDER.map(state=>({state,count:dto.counts[state]})),
  marketNotes:[...(dto.evidence.some(e=>e.kind==='financial_fact'&&e.state==='withheld')?['footer.cn']:[]),
   ...(dto.evidence.some(e=>e.state==='not_served')?['footer.hk']:[]),...(dto.expected_slots.some(s=>s.reason_code==='industry_not_published')?['footer.industry']:[])].map(text),
  attributions:[...new Set(drawers.map(d=>d.attribution_key))].sort().map(key=>text(`attribution.${key}`)),
  sources:drawers.map(d=>({publisher:d.source.publisher})),
  fredNote:dto.evidence.some(e=>e.kind==='macro_observation'&&e.state==='withheld'&&['licence_unconfirmed','catalog_restricted'].includes(e.reason??'')),
  freshness:Object.entries(dto.freshness_at_publication).map(([dataset,status])=>({dataset,status:status==='unknown'?'missing' as const:status})),age_days:dto.age_days};
}
