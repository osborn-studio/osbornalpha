import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
import { loadAdminView } from '@/lib/sources/admin-reader';
import { SourcesView } from './SourcesView';

export const dynamic = 'force-dynamic';

export default async function AdminSourcesPage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof AdminForbidden) {
      const t = await getTranslations('admin.sources');
      return <section className="border-y border-border py-8">
        <h1 className="text-xl font-bold">{t('st_denied_t')}</h1>
        <p className="mt-2 text-sm text-text-dim">{t('st_denied_b')}</p>
      </section>;
    }
    if (error instanceof AdminUnauthenticated) redirect('/login?next=%2Fadmin%2Fsources');
    throw error;
  }
  const [view, t, locale] = await Promise.all([loadAdminView(), getTranslations('admin.sources'), getLocale()]);
  return <SourcesView view={view} t={t} locale={locale === 'en' ? 'en' : 'zh'} />;
}
