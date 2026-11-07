// GET licences and settings; POST creates a licence (spec §8.2).
import {adminGet,adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {createLicence,listLicences,parseLicenceInput} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
export const GET=adminGet<unknown>('licences.list',async()=>jsonNoStore(await listLicences(coreDeps())));
export const POST=adminPost<unknown>('licences.create',async({body,userId})=>
 jsonNoStore({licence:await createLicence(coreDeps(),parseLicenceInput(body,'create'),userId)},201));
