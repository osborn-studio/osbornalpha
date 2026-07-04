import { getTranslations } from 'next-intl/server';

// Route-transition loading UI for the (app) group. Shown while a server
// component segment streams. Subtle skeleton matching the workbench layout.
export default async function AppLoading() {
  const t = await getTranslations('errors');
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label={t('loadingAria')}>
      <div className="h-7 w-40 rounded bg-bg-card" />
      <div className="card-base">
        <div className="mb-3 h-4 w-24 rounded bg-bg-elevated" />
        <div className="space-y-2">
          <div className="h-10 rounded bg-bg-elevated" />
          <div className="h-10 rounded bg-bg-elevated" />
          <div className="h-10 rounded bg-bg-elevated" />
        </div>
      </div>
    </div>
  );
}
