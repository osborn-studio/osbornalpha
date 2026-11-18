// Dossier disclosure and source attribution (spec §7.2, D7–D8).
import type {DossierDto} from '@/lib/topics/public-dto';
const datasets:Record<string,string>={'macro.fred':'macro_fred','macro.akshare':'macro_akshare','facts.us':'facts_us','facts.cn':'facts_cn','industry.agg.sic':'industry_agg_sic','industry.agg.sw2021':'industry_agg_sw2021'};
export const COUNT_ORDER=['ok','missing','withheld','not_served','unsupported','retracted'] as const;
export function footerModel(dto:DossierDto,text:(key:string)=>string){
 return {counts:COUNT_ORDER.map(state=>({state,count:dto.counts[state]})),
  marketNotes:[...(dto.evidence.some(e=>e.kind==='financial_fact'&&e.state==='withheld')?['footer.cn']:[]),
   ...(dto.evidence.some(e=>e.state==='not_served')?['footer.hk']:[]),...(dto.expected_slots.some(s=>s.reason_code==='industry_not_published')?['footer.industry']:[])].map(text),
  attributions:[...new Set(dto.attributions)].sort().map(key=>text(`attribution.${key}`)),
  sources:dto.attributions.map(key=>({publisher:text(`attribution.${key}`)})),
  fredNote:dto.evidence.some(e=>e.kind==='macro_observation'&&e.state==='withheld'&&['licence_unconfirmed','catalog_restricted'].includes(e.reason??'')),
  freshness:Object.entries(dto.freshness_at_publication).map(([dataset,status])=>({dataset,label:Object.hasOwn(datasets,dataset)?text(`datasets.${datasets[dataset]}`):dataset,status:status==='unknown'?'missing' as const:status})),age_days:dto.age_days};
}
