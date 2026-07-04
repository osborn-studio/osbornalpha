'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Artifact {
  id: string;
  skill_id: string;
  ticker: string | null;
  title: string;
  content_md: string;
  created_at: string;
}

export function ArtifactsPanel() {
  const t = useTranslations('tools.artifacts');
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artifacts?limit=20')
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setArtifacts(body.artifacts ?? []); })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card-base">
      <div className="mb-2 text-sm font-semibold text-text-dim">{t('heading')}</div>
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
                  <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">
                    {a.skill_id}{a.ticker ? ` · ${a.ticker}` : ''}
                  </span>
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
    </div>
  );
}
