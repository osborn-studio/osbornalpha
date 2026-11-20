// Topic public directory, frozen dossier and replay reads (spec §6.1–§6.2).
import type {PublicDeps} from './deps';
import type {Category} from './types';
import type {PublicTopicRow,PublicVersionRow} from './database-types';
import type {DirectoryItem,DossierDto,EvidenceDetailDto,VersionMeta} from './public-dto';
import {TopicError} from './errors';
import {ageDays,driftUnchecked,versionAtAsOf} from './asof';
import {maskedEntries,maskSnapshot} from './masking';
const open=async(d:PublicDeps)=>{if(!d.preview&&!await d.db.publicOpen())throw new TopicError('not_found');};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const meta=(v:PublicVersionRow,t:PublicTopicRow):VersionMeta=>({version_no:v.version_no,published_at:v.published_at,cutoff:v.cutoff,
 is_current:v.version_id===t.current_version_id,superseded:t.version_no!==null&&v.version_no<t.version_no,
 unpublished_at:v.unpublished_at,unpublish_reason:v.unpublish_reason});
async function topic(d:PublicDeps,slug:string):Promise<PublicTopicRow>{
 const t=await d.db.publicTopicBySlug(slug);if(!t)throw new TopicError('not_found');
 if(t.status==='retired')throw new TopicError('topic_retired',{reason:t.retired_reason});return t;
}
export async function listTopics(d:PublicDeps,q:{category?:Category;q?:string;cursor?:string;limit:number}):Promise<{items:DirectoryItem[];nextCursor:string|null}>{
 await open(d);
 if(q.q!==undefined&&q.q.length>32)throw new TopicError('invalid_parameter:q');
 if(!Number.isInteger(q.limit)||q.limit<1||q.limit>200)throw new TopicError('invalid_parameter:limit');
 let cursor:{published_at:string;slug:string}|null=null;
 if(q.cursor!==undefined){
  const decoded=Buffer.from(q.cursor,'base64url').toString('utf8'),parts=decoded.split('|');
  if(!q.cursor||Buffer.from(decoded).toString('base64url')!==q.cursor||parts.length!==2||!Number.isFinite(Date.parse(parts[0]))||!parts[1])throw new TopicError('invalid_parameter:cursor');
  cursor={published_at:parts[0],slug:parts[1]};
 }
 const prefix=q.q?.toLowerCase();
 const rows=(await d.db.publicTopics()).filter(t=>t.status==='published'&&t.version_no!==null&&t.published_at!==null)
  .filter(t=>!q.category||t.category===q.category)
  .filter(t=>prefix===undefined||t.title_zh?.toLowerCase().startsWith(prefix)||t.title_en?.toLowerCase().startsWith(prefix))
  .sort((a,b)=>compare(b.published_at!,a.published_at!)||compare(a.topic_slug,b.topic_slug))
  .filter(t=>!cursor||t.published_at!<cursor.published_at||(t.published_at===cursor.published_at&&t.topic_slug>cursor.slug));
 const page=rows.slice(0,q.limit),now=d.now();
 const items=await Promise.all(page.map(async(t):Promise<DirectoryItem>=>{
  const drift_counts={revised:0,newer_period:0,retracted:0,now_withheld:0,unverifiable:0};
  if(t.current_version_id)for(const row of await d.db.publicDrift(t.current_version_id))if(row.drift!=='unchanged')drift_counts[row.drift]++;
  return {slug:t.topic_slug,category:t.category,title:{zh:t.title_zh??'',en:t.title_en??''},dek:{zh:t.dek_zh??'',en:t.dek_en??''},
   version_no:t.version_no!,published_at:t.published_at!,evidence_counts:t.evidence_counts??{ok:0,missing:0,withheld:0,not_served:0,unsupported:0,retracted:0},drift_counts,stale:ageDays(t.published_at!,now)>90};
 }));
 const last=page.at(-1);
 return {items,nextCursor:rows.length>q.limit&&last?Buffer.from(`${last.published_at}|${last.topic_slug}`).toString('base64url'):null};
}
async function selected(d:PublicDeps,slug:string,o:{asOf?:string;version?:number}){
 const t=await topic(d,slug),versions=await d.db.publicVersions(t.topic_id),now=d.now();
 if(o.version!==undefined&&(!Number.isInteger(o.version)||o.version<1))throw new TopicError('invalid_parameter:version');
 if(o.version!==undefined&&o.asOf!==undefined)throw new TopicError('invalid_parameter:asOf');
 let number=o.version;
 const view:DossierDto['view']=o.version!==undefined?'version':o.asOf!==undefined?'replay':'current';
 if(o.asOf!==undefined){
  const pick=versionAtAsOf(versions,o.asOf,now.toISOString().slice(0,10));
  if(pick.kind==='no_version')throw new TopicError('no_version_at_asof');number=pick.version_no;
 }
 const v=number!==undefined?versions.find(v=>v.version_no===number):t.status==='unpublished'?
  [...versions].sort((a,b)=>b.version_no-a.version_no)[0]:versions.find(v=>v.version_id===t.current_version_id);
 if(!v)throw new TopicError('not_found');
 if(v.unpublished_at!==null)throw new TopicError('version_unpublished',{version_no:v.version_no,reason:v.unpublish_reason});
 if(!v.snapshot)throw new TopicError('not_found');
 const drift=new Map((await d.db.publicDrift(v.version_id)).map(row=>[row.ordinal,row]));
 return {t,v,versions,now,view,snapshot:v.snapshot,masked:maskSnapshot(v.snapshot,drift,view)};
}
export async function readTopic(d:PublicDeps,slug:string,o:{asOf?:string;version?:number}):Promise<DossierDto>{
 await open(d);
 const {t,v,versions,now,view,snapshot:s,masked}=await selected(d,slug,o);
 const ids=[...new Set(s.entries.flatMap(e=>e.entry_type==='licensed_excerpt'&&!('masked' in e)?[e.licence_id]:[]))];
 const entries=maskedEntries(s.entries,ids.length?await d.db.publicLicenceStatus(ids):[]);
 const age_days=ageDays(v.published_at,now);
 const attributions=[...new Set(masked.evidence.flatMap(e=>{
  const drawer=masked.drawers.get(e.ordinal);
  return e.state==='ok'&&!e.masked&&drawer&&'attribution_key' in drawer?[drawer.attribution_key]:[];
 }))].sort();
 return {attributions,topic:structuredClone(s.topic),version:meta(v,t),total_versions:versions.length,current_version_no:t.version_no,view,replay_as_of:o.asOf??null,
  sections:structuredClone(s.sections),evidence:masked.evidence,expected_slots:structuredClone(s.expected_slots),entries,summary:masked.summary,
  counts:structuredClone(s.counts),freshness_at_publication:structuredClone(s.freshness_at_publication),stale:age_days>90,age_days,
  drift_checked_at:t.drift_checked_at,drift_unchecked:driftUnchecked(t.drift_checked_at,now)};
}
export async function readVersions(d:PublicDeps,slug:string):Promise<VersionMeta[]>{
 await open(d);const t=await topic(d,slug);
 return (await d.db.publicVersions(t.topic_id)).sort((a,b)=>b.version_no-a.version_no).map(v=>meta(v,t));
}
export async function readEvidence(d:PublicDeps,slug:string,ordinal:number,version?:number):Promise<EvidenceDetailDto>{
 await open(d);const {v,masked}=await selected(d,slug,{version});
 const evidence=masked.evidence.find(e=>e.ordinal===ordinal);if(!evidence)throw new TopicError('not_found');
 return {evidence,drawer:masked.drawers.get(ordinal)??null,version_no:v.version_no};
}
