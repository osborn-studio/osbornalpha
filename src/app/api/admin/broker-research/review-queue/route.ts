// Metadata-only review queue; private evidence is fetched through logged routes (spec §8.2).
import {QueryError,intParam,readParams} from '@/lib/facts/public-route';
import {adminGet,jsonNoStore} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
import type {ReviewStatus} from '@/lib/broker-research/types';
export const dynamic='force-dynamic';
const STATUSES:readonly ReviewStatus[]=['pending','in_review','approved','rejected'];
export const GET=adminGet<unknown>('review_queue',async({request})=>{let p:Map<string,string>,limit:number;try{p=readParams(new URL(request.url),['status','limit','receipt']);limit=intParam(p,'limit',50,200);}catch(e){if(e instanceof QueryError)throw bad(e.message);throw e;}const status=p.get('status');if(status!==undefined&&!STATUSES.includes(status as ReviewStatus))throw bad('invalid_parameter:status');return jsonNoStore({reports:await brokerDeps().db.reviewQueue({status:status as ReviewStatus|undefined,limit})});});
