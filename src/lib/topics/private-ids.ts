// Session-only research reads for disclosure check 3.
import {requireResearchUser,type ResearchSupabase} from '@/lib/research/store';
import {TopicError} from './errors';

export async function researchSession(actor:string):Promise<ResearchSupabase>{
 const session=await requireResearchUser().catch(()=>{throw new Error('private_read_failed');});
 if(session.userId!==actor)throw new TopicError('not_found');
 return session.supabase;
}

export async function privateIds(supabase:ResearchSupabase):Promise<ReadonlySet<string>>{
 const ids=new Set<string>();
 const queries=[
  ()=>supabase.from('research_theses').select('id'),
  ()=>supabase.from('research_memos').select('id'),
  ()=>supabase.from('research_source_documents').select('id'),
  ()=>supabase.from('research_thesis_events').select('id'),
 ];
 try{
  for(const select of queries){
   let after:string|undefined;
   for(;;){
    let query=select().order('id');
    if(after)query=query.gt('id',after);
    const {data,error}=await query.limit(1000);
    if(error||!Array.isArray(data))throw new Error();
    if(!data.length)break;
    for(const row of data)ids.add(row.id);
    after=data[data.length-1].id;
   }
  }
 }catch{throw new Error('private_read_failed');}
 return ids;
}
