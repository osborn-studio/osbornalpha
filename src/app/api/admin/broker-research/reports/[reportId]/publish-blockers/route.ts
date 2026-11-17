// Read SQL publication blockers and review readiness (spec §6.5).
import {adminGet,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {publishBlockersOf} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const GET=adminGet<Ctx>('reports.blockers',async({ctx})=>jsonNoStore(await publishBlockersOf(brokerDeps(),uuidParam((await ctx.params).reportId))));
