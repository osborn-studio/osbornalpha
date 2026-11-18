import type {DirectoryItem} from '@/lib/topics/public-dto';

type EntryItem=Pick<DirectoryItem,'title'|'version_no'>&{drift_counts:Pick<DirectoryItem['drift_counts'],'revised'>};

export function readEntryItems(body:unknown):EntryItem[]{
 if(!body || typeof body!=='object' || !('items' in body) || !Array.isArray(body.items))throw Error('invalid_directory');
 return body.items.map(item=>{
  if(typeof item?.title?.zh!=='string'||typeof item.title.en!=='string'||!Number.isInteger(item.version_no)||
     !Number.isInteger(item.drift_counts?.revised))throw Error('invalid_directory_item');
  return item as EntryItem;
 });
}

// listTopics returns a newest-first directory page, including a stable slug tie-breaker.
export function entryCardModel(items:EntryItem[],locale:string){
 const latest=items[0];
 if(!latest)return null;
 return {published:items.length>=200?'200+':String(items.length),title:latest.title[locale.startsWith('zh')?'zh':'en'],
  version:latest.version_no,revised:items.filter(item=>item.drift_counts.revised>0).length};
}
