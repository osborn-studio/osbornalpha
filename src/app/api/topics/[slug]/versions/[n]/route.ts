// Topic public routes (spec §6.1).
import {readParams,QueryError} from '@/lib/facts/public-route';
import {publicDeps} from '@/lib/topics/deps';
import {jsonNoStore,topicRoute} from '@/lib/topics/public-route';
import {TopicError} from '@/lib/topics/errors';
import {readTopic} from '@/lib/topics/public-read';
export const dynamic='force-dynamic';
export const GET=topicRoute<{params:Promise<{slug:string;n:string}>}>('topics.readTopic',async({request,ctx})=>{
 const {slug,n}=await ctx.params;
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>64)throw new TopicError('not_found');
 if(!/^[1-9]\d{0,3}$/.test(n))throw new TopicError('not_found');
 const url=new URL(request.url),allowed:string[]=[];
 for(const key of url.searchParams.keys())if(!allowed.includes(key))throw new QueryError(key);
 readParams(url,allowed);
 return jsonNoStore(await readTopic(await publicDeps(),slug,{version:Number(n)}));
});
