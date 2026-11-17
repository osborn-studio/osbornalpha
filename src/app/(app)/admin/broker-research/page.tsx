// src/app/(app)/admin/broker-research/page.tsx
// Admin overview (spec §9.5; AdminOverview artboard).
import {adminReadDeps,loadOverview} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from './_shared/gate';
import {AdminShell} from './_shared/AdminShell';
import {OverviewView} from './OverviewView';

export const dynamic='force-dynamic';

export default async function BrokerResearchAdminPage(){
 if(!await adminGate('/admin/broker-research'))return <AdminDenied/>;
 const data=await loadOverview(adminReadDeps());
 return <AdminShell><OverviewView data={data}/></AdminShell>;
}
