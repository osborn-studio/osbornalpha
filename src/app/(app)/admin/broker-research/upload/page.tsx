// src/app/(app)/admin/broker-research/upload/page.tsx
import {adminReadDeps,isLicenceConfirmed} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {UploadClient} from './UploadClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchUploadPage(){
 if(!await adminGate('/admin/broker-research/upload'))return <AdminDenied/>;
 const deps=adminReadDeps(),today=deps.now().toISOString().slice(0,10);
 const licences=(await deps.db.listLicences()).map(l=>({licenceId:l.licence_id,label:l.source_label,version:l.version,confirmed:isLicenceConfirmed(l,today),confirmedAt:l.confirmed_at}));
 return <AdminShell><UploadClient licences={licences}/></AdminShell>;
}
