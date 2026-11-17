// src/app/(app)/admin/broker-research/preview/[reportId]/page.tsx
// Admin preview (spec §9.1; Preview artboard): service-role data, the same ReportView as the public page,
// labelled "预览 · 未对外". Works while public_enabled=false (spec §14 acceptance 8).
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {UUID_RE} from '@/lib/facts/public-route';
import {adminReadDeps} from '@/lib/broker-research/admin-read';
import {previewPageData} from '@/lib/broker-research/preview';
import {ReportView} from '@/app/(app)/intel/foreign-research/components/ReportView';
import {CALLOUT} from '@/app/(app)/intel/foreign-research/components/ui';
import {AdminDenied,adminGate} from '../../_shared/gate';
import {AdminShell} from '../../_shared/AdminShell';

export const dynamic='force-dynamic';

export default async function BrokerResearchPreviewPage({params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!await adminGate(`/admin/broker-research/preview/${encodeURIComponent(reportId)}`))return <AdminDenied/>;
 if(!UUID_RE.test(reportId))notFound();
 const t=await getTranslations('foreign-research.public.preview');
 const tp=await getTranslations('foreign-research.admin.previewPage');
 const res=await previewPageData(adminReadDeps(),reportId.toLowerCase());
 if(res.kind==='not_found')notFound();
 return (
  <AdminShell><div className="flex flex-col gap-4">
   <div role="status" className="flex flex-wrap items-center gap-4 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-bg">
    <span className="font-semibold">{t('banner')}</span><span>{t('bannerBody')}</span>
    <Link href={`/admin/broker-research/review/${reportId}`} className="ml-auto text-bg underline">{t('back')}</Link>
   </div>
   {res.kind==='incomplete'?<p className={CALLOUT}>{tp('incomplete')}</p>:<>
    {res.meta.metadataPublic?null:<p className={CALLOUT}>{tp('metadataHidden')}</p>}
    <ReportView data={res.data} preview={{status:res.meta.status,reviewStatus:res.meta.reviewStatus}}/>
   </>}
  </div></AdminShell>
 );
}
