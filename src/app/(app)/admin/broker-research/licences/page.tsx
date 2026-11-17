// src/app/(app)/admin/broker-research/licences/page.tsx
import {adminReadDeps,loadLicences} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {LicencesClient} from './LicencesClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchLicencesPage(){
 if(!await adminGate('/admin/broker-research/licences'))return <AdminDenied/>;
 const deps=adminReadDeps();
 return <AdminShell><LicencesClient views={await loadLicences(deps)} today={deps.now().toISOString().slice(0,10)}/></AdminShell>;
}
