// src/app/(app)/admin/broker-research/access-log/page.tsx
import {UUID_RE} from '@/lib/facts/public-route';
import {adminReadDeps,loadAccessLog} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {AccessLogClient} from './AccessLogClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchAccessLogPage({searchParams}:{searchParams:Promise<{document?:string}>}){
 if(!await adminGate('/admin/broker-research/access-log'))return <AdminDenied/>;
 const {document}=await searchParams;
 const documentId=document&&UUID_RE.test(document)?document.toLowerCase():undefined;
 const rows=await loadAccessLog(adminReadDeps(),{documentId,limit:500});
 return <AdminShell><AccessLogClient rows={rows} documentId={documentId??null}/></AdminShell>;
}
