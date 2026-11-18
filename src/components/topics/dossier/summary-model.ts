// Topic spec §7.2: render approved summary and masked fact notices.
import type {RenderedSummary} from '@/lib/topics/types';
export function summaryModel(summary:RenderedSummary&{hidden_points?:number}){
 return {...summary,facts:summary.facts.map(f=>({...f,noticeKey:f.text===''?'summary.masked':null})),hidden_points:summary.hidden_points??0};
}
