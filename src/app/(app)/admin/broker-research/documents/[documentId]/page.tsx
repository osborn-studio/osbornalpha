// src/app/(app)/admin/broker-research/documents/[documentId]/page.tsx
import {notFound} from 'next/navigation';
import {UUID_RE} from '@/lib/facts/public-route';
import {adminReadDeps} from '@/lib/broker-research/admin-read';
import {loadDocumentPage} from '@/lib/broker-research/admin-document';
import {AdminDenied,adminGate} from '../../_shared/gate';
import {AdminShell} from '../../_shared/AdminShell';
import {DocumentClient} from './DocumentClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchDocumentPage({params}:{params:Promise<{documentId:string}>}){
 const {documentId}=await params;
 if(!await adminGate(`/admin/broker-research/documents/${encodeURIComponent(documentId)}`))return <AdminDenied/>;
 if(!UUID_RE.test(documentId))notFound();
 const data=await loadDocumentPage(adminReadDeps(),documentId.toLowerCase());
 if(!data)notFound();
 return <AdminShell><DocumentClient data={data}/></AdminShell>;
}
