import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations('admin.sources');
  return <section role="status" aria-busy="true" className="space-y-2 rounded-md border border-border p-4">
    <span className="text-xs text-text-muted">{t('st_load')}</span>
    <div className="h-5 w-2/5 rounded bg-[var(--bg-hover)]" />
    <div className="h-9 rounded bg-[var(--bg-hover)]" /><div className="h-9 rounded bg-[var(--bg-hover)]" />
  </section>;
}
