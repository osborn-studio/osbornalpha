'use client';

import { useState } from 'react';
import { Panel, Button } from '@/components/ui';
import { outlineToMarkdown, type Outline } from '@/lib/skills/primary/ic-memo';

export interface OutlineWizardField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}

export interface OutlineWizardProps {
  icon: string;
  title: string;
  desc: string;
  fields: OutlineWizardField[];
  generate: (values: Record<string, string>) => Outline;
  skillId: string;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function OutlineWizard({ icon, title, desc, fields, generate, skillId }: OutlineWizardProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ''])),
  );
  const [outline, setOutline] = useState<Outline | null>(null);
  const [genErr, setGenErr] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [saveErr, setSaveErr] = useState('');
  const [artifactId, setArtifactId] = useState<string | null>(null);

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function onGenerate() {
    setGenErr('');
    setStatus('idle');
    setArtifactId(null);
    try {
      const o = generate(values);
      setOutline(o);
    } catch (e) {
      setOutline(null);
      setGenErr((e as Error).message || String(e));
    }
  }

  async function onSave() {
    if (!outline) return;
    setStatus('saving');
    setSaveErr('');
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skill_id: skillId,
          title: outline.title,
          content_md: outlineToMarkdown(outline),
          params: values,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setStatus('saved');
      setArtifactId(body?.artifact?.id ?? null);
    } catch (e) {
      setStatus('error');
      setSaveErr((e as Error).message || String(e));
    }
  }

  const missingRequired = fields.some((f) => f.required && !values[f.key]?.trim());

  return (
    <Panel title={`${icon} ${title}`}>
      <p className="mb-3 text-xs text-text-dim">{desc}</p>

      <div className="space-y-2">
        {fields.map((f) => (
          <label key={f.key} className="block text-xs">
            <span className="text-text-dim">
              {f.label}
              {f.required && <span className="text-down"> *</span>}
            </span>
            {f.textarea ? (
              <textarea
                value={values[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
                className="mt-1 w-full rounded-md bg-bg-card px-2 py-1.5 text-sm"
              />
            ) : (
              <input
                value={values[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="mt-1 w-full rounded-md bg-bg-card px-2 py-1.5 text-sm"
              />
            )}
          </label>
        ))}
      </div>

      <Button
        variant="primary"
        size="sm"
        className="mt-3"
        disabled={missingRequired}
        onClick={onGenerate}
      >
        生成大纲
      </Button>

      {genErr && <div className="mt-2 text-xs text-down">⚠️ {genErr}</div>}

      {outline && (
        <div className="mt-3 space-y-2">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-bg-card p-3 text-[11px] leading-relaxed text-text-muted">
            {outlineToMarkdown(outline)}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            disabled={status === 'saving'}
            onClick={onSave}
          >
            {status === 'saving' ? '存档中…' : '存入档案'}
          </Button>
          {status === 'saved' && (
            <div className="text-xs text-accent">
              ✅ 已存入档案{artifactId ? `（${artifactId.slice(0, 8)}…）` : ''}
            </div>
          )}
          {status === 'error' && <div className="text-xs text-down">⚠️ 存档失败：{saveErr}</div>}
        </div>
      )}
    </Panel>
  );
}
