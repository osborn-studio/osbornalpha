// Bind report metadata and optional analyst, then materialize and rerun rules (spec §6.3).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bindReport} from '@/lib/broker-research/review';
import type {BindInput} from '@/lib/broker-research/review';
import {bad} from '@/lib/broker-research/errors';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.bind',async({ctx,body,userId})=>{
 const raw=body.analyst;if(raw!==undefined&&(raw===null||typeof raw!=='object'||Array.isArray(raw)))throw bad('invalid_parameter:analyst');
 const a=raw as Record<string,unknown>|undefined;
 const analyst=a===undefined?undefined:{analystId:uuidParam(a.analystId,'analyst.analystId'),fieldId:uuidParam(a.fieldId,'analyst.fieldId'),role:typeof a.role==='string'?a.role:null};
 if(body.institutionId!==undefined&&body.institutionId!==null)uuidParam(body.institutionId,'institutionId');
 if(body.supersedesReportId!==undefined&&body.supersedesReportId!==null)uuidParam(body.supersedesReportId,'supersedesReportId');
 return jsonNoStore(await bindReport(brokerDeps(),uuidParam((await ctx.params).reportId),{...(body as BindInput),analyst},userId));
});
