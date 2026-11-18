// Topic public routes (spec §6.1).
import {readParams,QueryError,intParam} from '@/lib/facts/public-route';
import {publicDeps} from '@/lib/topics/deps';
import {jsonNoStore,topicRoute} from '@/lib/topics/public-route';
import {TopicError} from '@/lib/topics/errors';
import {listTopics} from '@/lib/topics/public-read';
import {CATEGORIES,type Category} from '@/lib/topics/types';
export const dynamic='force-dynamic';
export const GET=topicRoute('topics.list',async({request})=>{
 const url=new URL(request.url),allowed=['category','q','cursor','limit'];
 for(const key of url.searchParams.keys())if(!allowed.includes(key))throw new QueryError(key);
 const p=readParams(url,allowed),category=p.get('category');
 if(category!==undefined&&!CATEGORIES.includes(category as Category))throw new TopicError('invalid_parameter:category');
 return jsonNoStore(await listTopics(await publicDeps(),{category:category as Category|undefined,q:p.get('q'),cursor:p.get('cursor'),limit:intParam(p,'limit',50,200)}));
});
