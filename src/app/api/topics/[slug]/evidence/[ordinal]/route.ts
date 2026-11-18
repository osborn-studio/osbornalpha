// Topic public routes (spec §6.1).
import {readParams,QueryError,intParam} from '@/lib/facts/public-route';
import {publicDeps} from '@/lib/topics/deps';
import {jsonNoStore,topicRoute} from '@/lib/topics/public-route';
import {TopicError} from '@/lib/topics/errors';
import {readEvidence} from '@/lib/topics/public-read';
export const dynamic='force-dynamic';
export const GET=topicRoute<{params:Promise<{slug:string;ordinal:string}>}>('topics.readEvidence',async({request,ctx})=>{
 const {slug,ordinal}=await ctx.params;
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>64)throw new TopicError('not_found');
 if(!/^[1-9]\d{0,3}$/.test(ordinal))throw new TopicError('not_found');
 const url=new URL(request.url),allowed:string[]=['version'];
 for(const key of url.searchParams.keys())if(!allowed.includes(key))throw new QueryError(key);
 const p=readParams(url,allowed);
 return jsonNoStore(await readEvidence(await publicDeps(),slug,Number(ordinal),p.has('version')?intParam(p,'version',1,9999):undefined));
});
