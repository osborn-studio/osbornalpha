import type {TopicsDb,DraftEntry} from '../types';
import {licenceForm} from '../licences';
const sources=[
 {source:'Survey',status:'approved',text:'Published survey: 42'},
 {source:'Archive',status:'revoked',text:'Withdrawn survey: 31'},
] as const;
const date='2026-10-31';
export async function seedFixtureLicences(db:TopicsDb,actor:string){
 const licences=[];
 for(const {source,status,text} of sources){
  const url='https://example.org/'+source.toLowerCase();
  const fields=licenceForm({source_title:source,publisher:source,source_url:url,terms_url:url+'/terms',terms_read_at:date,terms_clause:'Short quotations with attribution',permits:{display_excerpt:true,link_required:true},status});
  const licence_id=await db.setLicence({licenceId:null,fields,actor});
  licences.push({licence_id,source,url,text});
 }
 return licences;
}
export async function fixtureExcerpts(db:TopicsDb,actor:string):Promise<DraftEntry[]>{
 const licences=await seedFixtureLicences(db,actor);
 return licences.map(({licence_id,source,url,text})=>({key:source.toLowerCase(),entry_type:'licensed_excerpt',licence_id,fragments:[{text,attribution:source,url,date}]}));
}
