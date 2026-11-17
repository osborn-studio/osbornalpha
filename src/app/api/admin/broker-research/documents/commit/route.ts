// Resumable upload commit, validating staged PDF bytes before private promotion (spec §6.1 step 3).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {commitIntent} from '@/lib/broker-research/upload';
export const dynamic='force-dynamic';
export const maxDuration=300;
export const POST=adminPost<unknown>('documents.commit',async({body,userId})=>jsonNoStore(await commitIntent(coreDeps(),uuidParam(body.intentId,'intentId'),userId)));
