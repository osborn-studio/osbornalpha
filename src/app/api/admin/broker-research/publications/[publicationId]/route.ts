// Admin-only publication snapshot with logged private text access (spec §8.2).
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {gone,notFound} from '@/lib/broker-research/errors';
export const dynamic='force-dynamic';interface Ctx{params:Promise<{publicationId:string}>}
export const GET=adminGet<Ctx>('publications.get',async({ctx,userId})=>{
 const deps=coreDeps(),p=await deps.db.getPublication(uuidParam((await ctx.params).publicationId));if(!p)throw notFound('publication_not_found');
 const report=await deps.db.getReport(p.report_id);if(!report)throw notFound('report_not_found');const doc=await deps.db.getDocument(report.document_id);if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw gone();
 return respondLogged(deps.db,{document_id:doc.document_id,user_id:userId,action:'text_viewed',detail:{publication_id:p.publication_id}}, {publication:p});
});
