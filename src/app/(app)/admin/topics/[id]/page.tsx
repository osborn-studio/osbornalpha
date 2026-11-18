// Topic plan T5.5: closed-by-default editor with server-resolved evidence and lint.
import {notFound} from 'next/navigation';
import {topicsEnabled} from '@/lib/topics/flags';
import {adminDeps} from '@/lib/topics/admin-deps';
import {UUID_RE} from '@/lib/topics/admin-route';
import {draftLint} from '@/lib/topics/drafts';
import {draftEvidenceView} from '@/lib/topics/evidence-search';
import {EditorClient} from '@/components/topics/admin/editor/EditorClient';
import {adminGate,AdminDenied} from '../_shared/gate';
export const dynamic='force-dynamic';
export default async function TopicEditorPage({params}:{params:Promise<{id:string}>}){
 if(!topicsEnabled())notFound();
 const user=await adminGate('/admin/topics');if(!user)return <AdminDenied/>;
 const {id}=await params;if(!UUID_RE.test(id))notFound();
 const deps=adminDeps(),topicId=id.toLowerCase();
 const [topic,draft,settings]=await Promise.all([deps.db.topicById(topicId),deps.db.draftOf(topicId),deps.db.settings()]);
 if(!topic||!draft)notFound();
 return <EditorClient initial={{id:topicId,slug:topic.topic_slug,revision:draft.revision,body:draft.body,updated_at:draft.updated_at,public_enabled:settings.public_enabled,retired:topic.status==='retired',lint:draftLint(draft.body),evidence:await draftEvidenceView(deps,draft.body)}}/>;
}
