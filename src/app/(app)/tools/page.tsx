'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';

interface Artifact {
  id: string;
  skill_id: string;
  ticker: string | null;
  title: string;
  created_at: string;
}

const CARD_DEFS = [
  { icon: '🧰', key: 'skills', href: '/skills' },
  { icon: '🧪', key: 'backtest', href: '/backtest' },
  { icon: '🧮', key: 'dcf', href: '/tools/dcf' },
  { icon: '🏛️', key: 'primary', href: '/tools/primary' },
] as const;

export default function ToolsPage() {
  const t = useTranslations('tools.portal');
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artifacts?limit=8')
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setArtifacts(body.artifacts ?? []); })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">{t('heading')}</h1>
      <p className="mb-4 text-sm text-text-dim">{t('subheading')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CARD_DEFS.map((c) => (
          <Link key={c.href} href={c.href} className="card-base block transition-colors hover:bg-bg-card">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-lg">{c.icon}</span>{t(`cards.${c.key}.title`)}
            </div>
            <div className="mt-1 text-xs text-text-muted">{t(`cards.${c.key}.desc`)}</div>
            <div className="mt-2 text-xs font-semibold text-accent">{t('enter')}</div>
          </Link>
        ))}
      </div>

      <Panel title={t('recentOutputs')} className="mt-4">
        {err && <div className="text-xs text-down">{t('loadFailed', { error: err })}</div>}
        {!err && artifacts === null && <div className="text-xs text-text-muted">{t('loading')}</div>}
        {!err && artifacts !== null && artifacts.length === 0 && (
          <div className="text-xs text-text-muted">{t('empty')}</div>
        )}
        {artifacts && artifacts.length > 0 && (
          <div className="space-y-1">
            {artifacts.map((a) => (
              <div key={a.id} className="grid grid-cols-[auto_auto_1fr] items-center gap-3 rounded-md bg-bg-card px-3 py-2">
                <span className="font-mono text-[11px] text-text-dim">{a.created_at.slice(0, 10)}</span>
                <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">
                  {a.skill_id}{a.ticker ? ` · ${a.ticker}` : ''}
                </span>
                <span className="truncate text-sm">{a.title}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Disclaimer />
    </>
  );
}
