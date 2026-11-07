// Admin-only access log listing; no IP data (spec §8.2).
import {QueryError,intParam,readParams} from '@/lib/facts/public-route';
import {adminGet,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
export const dynamic='force-dynamic';
export const GET=adminGet<unknown>('access_log',async({request})=>{let p:Map<string,string>,limit:number;try{p=readParams(new URL(request.url),['document','limit']);limit=intParam(p,'limit',100,500);}catch(e){if(e instanceof QueryError)throw bad(e.message);throw e;}const document=p.get('document');return jsonNoStore({rows:await coreDeps().db.listAccessLog({documentId:document===undefined?undefined:uuidParam(document,'document'),limit})});});
