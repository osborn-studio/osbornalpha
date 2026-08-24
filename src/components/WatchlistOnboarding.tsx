'use client';

import { useTranslations } from 'next-intl';

interface WatchlistOnboardingProps {
  onSearch: () => void;
  onImport: () => void;
  onSample: () => void;
}

export function WatchlistOnboarding({
  onSearch,
  onImport,
  onSample,
}: WatchlistOnboardingProps) {
  const t = useTranslations('market.watchlist.onboarding');
  const actions = [
    { key: 'search', symbol: '＋', onClick: onSearch },
    { key: 'import', symbol: '📥', onClick: onImport },
    { key: 'sample', symbol: '◎', onClick: onSample },
  ] as const;

  return (
    <section className="border-y border-border py-6" aria-labelledby="watchlist-onboarding-title">
      <h2 id="watchlist-onboarding-title" className="text-base font-semibold">
        {t('title')}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-text-dim">
        {t('description')}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            title={t(`${action.key}Title`)}
            className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-bg-card px-3 py-2 text-left text-sm font-semibold hover:border-accent-dim hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-base" aria-hidden="true">{action.symbol}</span>
            <span>{t(action.key)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
