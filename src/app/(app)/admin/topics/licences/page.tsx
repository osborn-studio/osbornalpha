import {notFound} from 'next/navigation';
import {topicsEnabled} from '@/lib/topics/flags';
import {adminDeps} from '@/lib/topics/admin-deps';
import {LicenceRegister} from '@/components/topics/admin/LicenceRegister';
import {adminGate,AdminDenied} from '../_shared/gate';
export const dynamic='force-dynamic';
export default async function LicencePage(){
 if(!topicsEnabled())notFound();
 const user=await adminGate('/admin/topics/licences');if(!user)return <AdminDenied/>;
 return <LicenceRegister initial={await (await adminDeps()).db.licences()}/>;
}
