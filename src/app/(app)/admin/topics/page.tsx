// Topic plan T5.4: closed-by-default admin directory, loaded directly through the port.
import {notFound} from 'next/navigation';
import {topicsEnabled} from '@/lib/topics/flags';
import {adminDeps} from '@/lib/topics/admin-deps';
import {TopicList} from '@/components/topics/admin/TopicList';
import {adminGate,AdminDenied} from './_shared/gate';
export const dynamic='force-dynamic';
export default async function TopicsAdminPage(){
 if(!topicsEnabled())notFound();
 const user=await adminGate('/admin/topics');if(!user)return <AdminDenied/>;
 const {db}=adminDeps();
 const [rows,settings]=await Promise.all([db.adminTopics(),db.settings()]);
 return <TopicList rows={rows} settings={settings}/>;
}
