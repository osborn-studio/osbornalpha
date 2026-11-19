import type {PublicEntry} from '@/lib/topics/excerpts';
export function excerptLines(entry:Extract<PublicEntry,{entry_type:'licensed_excerpt'}>){
 return 'masked' in entry?entry.attributions.map(a=>({...a,text:null,date:null})):entry.fragments;
}
