// Create a private staging upload intent and signed upload URL (spec §6.1 step 1).
import {adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {createIntent,parseIntentInput} from '@/lib/broker-research/upload';
export const dynamic='force-dynamic';
export const POST=adminPost<unknown>('documents.intent',async({body,userId})=>jsonNoStore(await createIntent(coreDeps(),parseIntentInput(body),userId),201));
