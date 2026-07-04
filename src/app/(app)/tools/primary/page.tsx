'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { OutlineWizard } from '@/components/tools/OutlineWizard';
import { icMemoOutline } from '@/lib/skills/primary/ic-memo';
import { pePortfolioOutline } from '@/lib/skills/primary/pe-portfolio';
import { lpTrackingOutline } from '@/lib/skills/primary/lp-tracking';
import { Panel } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';

interface Artifact {
  id: string;
  skill_id: string;
  ticker: string | null;
  title: string;
  content_md: string;
  created_at: string;
}

const SKILL_IDS = ['ic-memo', 'pe-portfolio', 'lp-tracking'] as const;

export default function PrimaryMarketWorkbenchPage() {
  const t = useTranslations('tools.primary');
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      SKILL_IDS.map((id) =>
        fetch(`/api/artifacts?skill_id=${encodeURIComponent(id)}&limit=8`)
          .then((r) => r.json())
          .then((body) => (body.artifacts ?? []) as Artifact[]),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = lists.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setArtifacts(merged);
      })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">{t('heading')}</h1>
      <p className="mb-4 text-sm text-text-dim">
        {t('subheading')}
      </p>

      <div className="space-y-3">
        <OutlineWizard
          icon="📋"
          title={t('icMemo.title')}
          desc={t('icMemo.desc')}
          skillId="ic-memo"
          fields={[
            { key: 'target', label: t('icMemo.fields.target.label'), placeholder: t('icMemo.fields.target.placeholder'), required: true },
            { key: 'dealContext', label: t('icMemo.fields.dealContext.label'), placeholder: t('icMemo.fields.dealContext.placeholder'), textarea: true },
          ]}
          generate={(v) => icMemoOutline(v.target, v.dealContext)}
        />

        <OutlineWizard
          icon="📊"
          title={t('pePortfolio.title')}
          desc={t('pePortfolio.desc')}
          skillId="pe-portfolio"
          fields={[
            { key: 'fund', label: t('pePortfolio.fields.fund.label'), placeholder: t('pePortfolio.fields.fund.placeholder'), required: true },
          ]}
          generate={(v) => pePortfolioOutline(v.fund)}
        />

        <OutlineWizard
          icon="🕵️"
          title={t('lpTracking.title')}
          desc={t('lpTracking.desc')}
          skillId="lp-tracking"
          fields={[
            { key: 'names', label: t('lpTracking.fields.names.label'), placeholder: t('lpTracking.fields.names.placeholder'), required: true, textarea: true },
            { key: 'windowLabel', label: t('lpTracking.fields.windowLabel.label'), placeholder: t('lpTracking.fields.windowLabel.placeholder') },
          ]}
          generate={(v) =>
            lpTrackingOutline(
              v.names.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean),
              v.windowLabel,
            )
          }
        />
      </div>

      <Panel title={t('archive')} className="mt-4">
        {err && <div className="text-xs text-down">{t('loadFailed', { error: err })}</div>}
        {!err && artifacts === null && <div className="text-xs text-text-muted">{t('loading')}</div>}
        {!err && artifacts !== null && artifacts.length === 0 && (
          <div className="text-xs text-text-muted">{t('empty')}</div>
        )}
        {artifacts && artifacts.length > 0 && (
          <div className="space-y-1">
            {artifacts.map((a) => {
              const open = openId === a.id;
              return (
                <div key={a.id} className="rounded-md bg-bg-card">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="grid w-full grid-cols-[auto_auto_1fr] items-center gap-3 px-3 py-2 text-left"
                  >
                    <span className="font-mono text-[11px] text-text-dim">{a.created_at.slice(0, 10)}</span>
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">{a.skill_id}</span>
                    <span className="truncate text-sm">{a.title}</span>
                  </button>
                  {open && (
                    <pre className="whitespace-pre-wrap border-t border-border px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                      {a.content_md}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Disclaimer />
    </>
  );
}
