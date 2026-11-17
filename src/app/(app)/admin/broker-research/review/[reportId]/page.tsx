// src/app/(app)/admin/broker-research/review/[reportId]/page.tsx
import {notFound} from 'next/navigation';
import {UUID_RE} from '@/lib/facts/public-route';
import {AdminDenied,adminGate} from '../../_shared/gate';
import {AdminShell} from '../../_shared/AdminShell';
import {ReviewClient} from './ReviewClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchReviewPage({params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!await adminGate(`/admin/broker-research/review/${encodeURIComponent(reportId)}`))return <AdminDenied/>;
 if(!UUID_RE.test(reportId))notFound();
 return <AdminShell><ReviewClient reportId={reportId.toLowerCase()}/></AdminShell>;
}
