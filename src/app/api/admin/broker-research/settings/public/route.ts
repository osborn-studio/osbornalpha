// POST changes the audited database public switch (spec §4.1, §8.2; FR-6 owner gate).
import {adminPost,boolField,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {setPublicEnabled} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
export const POST=adminPost<unknown>('settings.public',async({body,userId})=>jsonNoStore({settings:await setPublicEnabled(coreDeps(),boolField(body,'enabled'),userId)}));
