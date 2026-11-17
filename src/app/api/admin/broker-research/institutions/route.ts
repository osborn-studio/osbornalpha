// Admin institution list and audited upsert (spec §8.2; D6).
import {adminGet,adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {upsertInstitution} from '@/lib/broker-research/institutions';
export const dynamic='force-dynamic';
export const GET=adminGet<unknown>('institutions.list',async()=>jsonNoStore({institutions:await coreDeps().db.listInstitutions()}));
export const POST=adminPost<unknown>('institutions.upsert',async({body,userId})=>jsonNoStore({institutionId:await upsertInstitution(coreDeps(),body,userId)},201));
