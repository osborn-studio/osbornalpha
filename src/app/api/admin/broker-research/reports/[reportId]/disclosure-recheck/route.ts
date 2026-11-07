// Recheck disclosure against a digest and restore disclosure_ok only if every surface passes (spec §4.11).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {recheckDisclosure} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.disclosure_recheck',async({ctx,userId})=>jsonNoStore(await recheckDisclosure(brokerDeps(),uuidParam((await ctx.params).reportId),userId)));
