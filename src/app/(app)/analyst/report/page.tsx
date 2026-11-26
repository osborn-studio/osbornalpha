'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button, Panel } from '@/components/ui';
import { AnalystReportBoard } from '@/components/analyst/AnalystReportBoard';
import type { AnalystReport } from '@/lib/analyst/report-types';

export default function AnalystReportPage() {
  const t = useTranslations('analyst');
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AnalystReport | null>(null);
  const [error, setError] = useState<'' | 'denied' | 'login' | 'failed'>('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/analyst/report', { credentials:'same-origin', cache:'no-store', signal:controller.signal });
        const loginRedirect = response.redirected && /\/(?:login)\/?$/.test(new URL(response.url).pathname);
        if (loginRedirect || !response.ok) {
          if (!controller.signal.aborted) {
            setData(null);
            setError(loginRedirect || response.status === 401 ? 'login' : response.status === 403 ? 'denied' : 'failed');
          }
          return;
        }
        const report: AnalystReport = await response.json();
        if (!controller.signal.aborted) { setData(report); setError(''); }
      } catch {
        if (!controller.signal.aborted) { setData(null); setError('failed'); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  const refresh = () => { setLoading(true); setError(''); setAttempt(n => n+1); };
  const backLink = <Link className="text-xs text-accent" href="/analyst">{t('nav.back')}</Link>;
  if (data) return <AnalystReportBoard data={data} refresh={refresh} refreshing={loading} backLink={backLink} />;
  return <div className="space-y-4 p-4">{backLink}
    <h1 className="text-2xl font-semibold">{t('report.title')}</h1><Panel>
      {loading ? <p role="status">{t('report.loading')}</p> : error && <div role="alert" className="space-y-3">
        <p>{t('report.'+error)}</p>{error === 'login' ? <Link className="text-accent" href="/login?next=/analyst/report">{t('report.signIn')}</Link> :
          error === 'failed' && <Button size="sm" variant="secondary" onClick={refresh}>{t('report.retry')}</Button>}
      </div>}
    </Panel></div>;
}
