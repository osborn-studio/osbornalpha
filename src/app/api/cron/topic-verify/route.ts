import {sha256Hex} from '@/lib/evidence/hash';
import {topicCron} from '@/lib/topics/cron-route';
import {cronDeps} from '@/lib/topics/deps';
import {SYSTEM_ACTOR,verifyVersion} from '@/lib/topics/verify';

export const dynamic='force-dynamic';
export const maxDuration=300;

function isoWeek(date:Date){
 const thursday=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 thursday.setUTCDate(thursday.getUTCDate()+4-(thursday.getUTCDay()||7));
 const year=thursday.getUTCFullYear();
 const week=Math.ceil(((thursday.getTime()-Date.UTC(year,0,1))/86_400_000+1)/7);
 return `${year}-W${String(week).padStart(2,'0')}`;
}

const run=topicCron('topic-verify',async codeVersion=>{
 const deps=await cronDeps(),started=deps.now(),deadline=started.getTime()+250_000;
 const seed=isoWeek(started);
 // As in the industry replay check, hash ranks are independent of database row order.
 const sample=(await deps.db.liveVersionRefs())
  .map(version=>({version,rank:sha256Hex(seed+'|'+version.version_id)}))
  .sort((a,b)=>a.rank.localeCompare(b.rank)).slice(0,20);
 let verified=0,mismatched_versions=0;
 for(const {version} of sample){
  if(deps.now().getTime()>=deadline)break;
  const result=await verifyVersion({...deps,codeVersion},{topicId:version.topic_id,versionNo:version.version_no,actor:SYSTEM_ACTOR});
  verified++;
  if(result.mismatched.length)mismatched_versions++;
 }
 return {verified,mismatched_versions};
});
export {run as GET,run as POST};
