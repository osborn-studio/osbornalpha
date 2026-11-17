// Admin institution maintenance (spec §9.1; D6). Gate before service-role reads; writes use admin routes.
import {adminReadDeps} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {InstitutionsClient} from './InstitutionsClient';
export const dynamic='force-dynamic';
export default async function BrokerResearchInstitutionsPage(){
 if(!await adminGate('/admin/broker-research/institutions'))return <AdminDenied/>;
 const {db}=adminReadDeps(),institutions=await db.listInstitutions();
 const details=await Promise.all(institutions.map(async institution=>{
  const [scales,analysts]=await Promise.all([db.listRatingScales(institution.institution_id),db.listAnalysts(institution.institution_id)]);
  return {institution,scales,analysts};
 }));
 return <AdminShell><InstitutionsClient details={details}/></AdminShell>;
}
