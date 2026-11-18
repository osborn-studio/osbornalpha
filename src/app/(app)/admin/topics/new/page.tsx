// Topic plan T5.4: closed-by-default topic creation.
import {notFound} from 'next/navigation';
import {topicsEnabled} from '@/lib/topics/flags';
import {NewTopicForm} from '@/components/topics/admin/NewTopicForm';
import {adminGate,AdminDenied} from '../_shared/gate';
export const dynamic='force-dynamic';
export default async function NewTopicPage(){
 if(!topicsEnabled())notFound();
 const user=await adminGate('/admin/topics/new');if(!user)return <AdminDenied/>;
 return <NewTopicForm/>;
}
