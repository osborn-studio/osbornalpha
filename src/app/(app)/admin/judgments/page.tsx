// /admin/judgments (spec §9.5, canvas board 5): requireAdminUser gate (same pattern as /admin/dq); the queue client does the rest.
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
import { AdminJudgmentsClient } from './AdminJudgmentsClient';

export const dynamic = 'force-dynamic';

export default async function AdminJudgmentsPage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof AdminForbidden) {
      const t = await getTranslations('judgments');
      return (
        <section className="border-y border-border py-8">
          <h1 className="text-xl font-bold">{t('ui.admin.deniedTitle')}</h1>
          <p className="mt-2 text-sm text-text-dim">{t('ui.admin.deniedBody')}</p>
        </section>
      );
    }
    if (error instanceof AdminUnauthenticated) redirect('/login?next=%2Fadmin%2Fjudgments');
    throw error;
  }
  return <AdminJudgmentsClient />;
}
