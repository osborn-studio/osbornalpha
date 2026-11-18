// Topic plan T5.4: client-safe list projection and creation validation.
import {CATEGORIES,type Bilingual,type Category,type TopicsDb} from '@/lib/topics/types';
export type AdminTopicRow=Awaited<ReturnType<TopicsDb['adminTopics']>>[number];
export type ListStatus='draft'|'published'|'unpublished'|'retired';
export interface ListRow{topic_id:string;slug:string;title:Bilingual;category:Category;status:ListStatus;current_version_no:number|null;revised_count:number;origin:'promoted'|null;created_at:string}
export function listModel(rows:AdminTopicRow[],f:{status:ListStatus;revisedOnly:boolean}):{tabs:Record<ListStatus,number>;rows:ListRow[]}{
 const tabs:Record<ListStatus,number>={draft:0,published:0,unpublished:0,retired:0};
 for(const r of rows)tabs[r.status]++;
 return {tabs,rows:rows.filter(r=>r.status===f.status&&(!f.revisedOnly||r.revised_count>0)).map(r=>({
  topic_id:r.topic_id,slug:r.topic_slug,title:r.title,category:r.category,status:r.status,current_version_no:r.current_version_no,
  revised_count:r.revised_count,origin:r.promoted?'promoted' as const:null,created_at:r.created_at,
 })).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.slug.localeCompare(b.slug))};
}
export function newTopicErrors(input:{slug:string;category:string;title:Bilingual}):Record<string,string>{
 const errors:Record<string,string>={};
 if(input.slug.length<3||input.slug.length>64||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug))errors.slug='errors.slug';
 if(!CATEGORIES.some(c=>c===input.category))errors.category='errors.category';
 for(const loc of ['zh','en'] as const)if(!input.title[loc].trim()||input.title[loc].length>120)errors[`title.${loc}`]='errors.title';
 return errors;
}
