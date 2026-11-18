// Topic directory card projection (spec §7.1, D9–D10).
import type {DirectoryItem} from '@/lib/topics/public-dto';
export const COUNT_ORDER=['ok','missing','withheld','not_served','unsupported','retracted'] as const;
export function cardModel(item:DirectoryItem,locale:string){
 const lang=locale.startsWith('zh')?'zh':'en';
 const badges:({kind:'revised';n:number}|{kind:'stale'|'mostlyWithheld'})[]=[];
 if(item.drift_counts.revised>0)badges.push({kind:'revised',n:item.drift_counts.revised});
 if(item.stale)badges.push({kind:'stale'});
 if(item.evidence_counts.withheld>Object.values(item.evidence_counts).reduce((a,b)=>a+b,0)/2)badges.push({kind:'mostlyWithheld'});
 return {title:item.title[lang],dek:item.dek[lang],href:`/intel/topics/${item.slug}`,versionLine:`v${item.version_no} · ${item.published_at.slice(0,10)}`,
  counts:COUNT_ORDER.filter(state=>item.evidence_counts[state]>0).map(state=>({state,n:item.evidence_counts[state]})),badges};
}
