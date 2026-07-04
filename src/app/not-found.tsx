import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// App-wide 404. Replaces Next's default bare page with a branded, navigable one.
export default async function NotFound() {
  const t = await getTranslations('errors.notFoundPage');
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl font-bold text-accent">404</div>
      <h1 className="mt-3 text-lg font-bold">{t('title')}</h1>
      <p className="mt-1 text-sm text-text-dim">{t('description')}</p>
      <div className="mt-5 flex items-center gap-2">
        <Link href="/today" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
          {t('backHome')}
        </Link>
        <Link href="/watchlist" className="rounded-md bg-bg-card px-4 py-2 text-sm text-text-dim hover:text-text">
          {t('watchlist')}
        </Link>
      </div>
    </div>
  );
}
