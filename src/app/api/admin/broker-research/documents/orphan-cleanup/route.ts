// Remove attributable expired or abandoned staging uploads (spec §6.1 step 4).
import {adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {orphanCleanup} from '@/lib/broker-research/upload';
export const dynamic='force-dynamic';
export const POST=adminPost<unknown>('documents.orphan_cleanup',async({userId})=>jsonNoStore(await orphanCleanup(coreDeps(),userId)));
