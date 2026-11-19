import type {TopicsDb} from '../types';
import {TopicError} from '../errors';
import {projectSummaryRun} from './db';

export async function latestRun(db:TopicsDb,topicId:string,locale:'zh'|'en'){
 const run=await db.latestSummaryRun(topicId,locale);
 if(!run)return null;
 const rows=run.state==='accepted'?await db.summariesOf(topicId,run.draft_hash):[];
 return projectSummaryRun({...run,summary:rows.find(row=>row.run_id===run.run_id)??null});
}
export async function publicationSummary(db:TopicsDb,topicId:string,hash:string){
 // One frozen summary for all readers. Prefer an approved Chinese version, then English.
 const [zh,en]=await Promise.all([db.approvedSummary(topicId,hash,'zh'),db.approvedSummary(topicId,hash,'en')]);
 if(zh||en)return zh??en;
 const runs=await Promise.all([latestRun(db,topicId,'zh'),latestRun(db,topicId,'en')]);
 const candidates=runs.flatMap(r=>r?.summary&&r.summary.status!=='discarded'?[r.summary]:[]);
 return candidates.find(s=>s.draft_hash===hash)??candidates.find(s=>s.status==='approved')??null;
}
export async function decideSummary(db:TopicsDb,topicId:string,summaryId:string,decision:'approve'|'discard',actor:string){
 const row=await db.summaryById(topicId,summaryId);
 if(!row)throw new TopicError('not_found');
 if(decision==='approve'&&(await db.draftOf(topicId))?.draft_hash!==row.draft_hash)throw new TopicError('draft_changed');
 await db.approveSummary({summaryId,decision,actor});
 return {status:decision==='approve'?'approved':'discarded'};
}
