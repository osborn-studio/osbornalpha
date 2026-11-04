import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { AdminDqClient } from './AdminDqClient';

export default async function AdminDqPage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof AdminForbidden) {
      const t = await getTranslations('admin.dq');
      return (
        <section className="border-y border-border py-8">
          <h1 className="text-xl font-bold">{t('deniedTitle')}</h1>
          <p className="mt-2 text-sm text-text-dim">{t('deniedBody')}</p>
        </section>
      );
    }
    if (error instanceof AdminUnauthenticated) redirect('/login?next=%2Fadmin%2Fdq');
    throw error;
  }

  return <AdminDqClient />;
}
