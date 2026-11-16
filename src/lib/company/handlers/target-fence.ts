import {resolvePublicIssuer} from '@/lib/facts/public-route';
import type {PublicIssuer} from '@/lib/facts/public-route';
import type {RouteCtx} from '../route';

// Retry from the original alias and ownership date, rather than walking a stale target's lineage.
export const resolveReadIssuer=(ctx:RouteCtx)=>resolvePublicIssuer(ctx.deps.tables,ctx.issuer.ticker,ctx.today,ctx.issuer.tickerAsOf);

// lineageOf(oldTarget) can remain [oldTarget] after it merges away. Check the target itself
// LAST, after membership/revisions and evidence/PDF reads, including single-member snapshots.
export async function readTargetUnchanged(ctx:RouteCtx,issuer:PublicIssuer):Promise<boolean>{
 const row=(await ctx.deps.tables.select('issuers',{issuer_id:issuer.issuerId},{limit:1}))[0];
 return !!row&&row.status!=='merged'&&row.merged_into===null;
}
