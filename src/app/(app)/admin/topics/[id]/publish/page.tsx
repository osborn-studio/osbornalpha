// Topic plan T6.8: authenticated publication workspace for the saved revision.
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getLocale,getTranslations} from 'next-intl/server';
import {adminDeps} from '@/lib/topics/admin-deps';
import {UUID_RE} from '@/lib/topics/admin-route';
import {topicsEnabled} from '@/lib/topics/flags';
import {loadVersionRows} from '@/lib/topics/publish';
import {PublishClient} from '@/components/topics/admin/publish/PublishClient';
import {adminGate,AdminDenied} from '../../_shared/gate';
import {TopicAdminFrame} from '../../_shared/TopicAdminFrame';
export const dynamic='force-dynamic';
export default async function TopicPublishPage({params}:{params:Promise<{id:string}>}){
 if(!topicsEnabled())notFound();
 const user=await adminGate('/admin/topics');if(!user)return <AdminDenied/>;
 const {id}=await params;if(!UUID_RE.test(id))notFound();
 const topicId=id.toLowerCase(),{db}=await adminDeps();
 const [topic,draft,settings]=await Promise.all([db.topicById(topicId),db.draftOf(topicId),db.settings()]);
 if(!topic||!draft)notFound();
 const [versions,receipt,t,locale]=await Promise.all([loadVersionRows(db,topic),db.latestReceipt(topicId,draft.draft_hash),getTranslations('topicsAdmin'),getLocale()]);
 const editorHref='/admin/topics/'+topicId;
 const header=<><nav aria-label={t('flow.label')}><Link href={editorHref} className="text-accent underline">{draft.body.title[locale.startsWith('zh')?'zh':'en']}</Link> / <span aria-current="page">{t('flow.label')}</span></nav>
  <span className="rounded border border-border px-2 py-1">{t(settings.public_enabled?'frame.publicOpen':'frame.publicClosed')}</span></>;
 return <TopicAdminFrame crumb={t('flow.label')} title={t('publish.title')} headerChips={header}>
  <PublishClient initial={{id:topicId,revision:draft.revision,draft_hash:draft.draft_hash,title:draft.body.title,slug:topic.topic_slug,retired:topic.status==='retired',versions,
   receipt:receipt&&{receipt_id:receipt.receipt_id,passed:receipt.passed,checks:receipt.checks,created_at:receipt.created_at}}}/>
 </TopicAdminFrame>;
}
