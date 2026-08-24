'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@/lib/llm/providers';
import { useToast } from '@/components/Toast';

export function LlmSettings() {
  const t = useTranslations('components.llmSettings');
  const { show } = useToast();
  const [provider, setProvider] = useState<ProviderId>('ark');
  const [model, setModel] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [configured, setConfigured] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    fetch('/api/llm/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data?.provider) {
          setProvider(data.provider as ProviderId);
          setConfigured(!!data.configured);
          setModel(data.model || PROVIDERS[data.provider as ProviderId]?.defaultModel || '');
        } else {
          setModel(PROVIDERS.ark.defaultModel);
        }
      })
      .catch(() => {
        setModel(PROVIDERS.ark.defaultModel);
      });
  }, []);

  async function onTest() {
    setTesting(true);
    setTestResult('');
    try {
      const r = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey }),
      });
      const j = await r.json();
      setTestResult(
        j.ok ? `✓ ${t('connectionSuccess', { ms: Math.round(j.latencyMs) })}` : '✗ ' + (j.error || t('failed')),
      );
    } catch (e) {
      setTestResult('✗ ' + String(e));
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    if (!apiKey) {
      show(t('enterApiKey'));
      return;
    }
    const r = await fetch('/api/llm/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey }),
    });
    const j = await r.json();
    if (r.ok) {
      show(`✓ ${t('saved')}`);
      setConfigured(true);
      setApiKey('');
    } else {
      show(j.error || t('saveFailed'));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-dim">{t('provider')}</label>
        <select
          value={provider}
          onChange={(e) => {
            const p = e.target.value as ProviderId;
            setProvider(p);
            setModel(PROVIDERS[p].defaultModel);
          }}
          className="rounded-md bg-bg-card px-3 py-2 text-sm"
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {PROVIDERS[id].label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-dim">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            configured
              ? t('apiKeyConfiguredPlaceholder')
              : t('apiKeyPlaceholder')
          }
          className="w-full rounded-md bg-bg-card px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-dim">{t('model')}</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md bg-bg-card px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onTest}
          disabled={testing || !apiKey}
          className="rounded-md bg-bg-card px-4 py-2 text-sm disabled:opacity-50"
        >
          {t('testConnection')}
        </button>
        <button
          onClick={onSave}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold"
        >
          {t('save')}
        </button>
      </div>

      {testResult && <div className="text-xs text-text-dim">{testResult}</div>}

      <p className="text-[11px] leading-relaxed text-text-muted">
        {t('description')}
      </p>
    </div>
  );
}
