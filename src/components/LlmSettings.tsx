'use client';

import { useEffect, useState } from 'react';
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@/lib/llm/providers';
import { useToast } from '@/components/Toast';

export function LlmSettings() {
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
        j.ok ? '✓ 连接成功 (' + Math.round(j.latencyMs) + 'ms)' : '✗ ' + (j.error || '失败'),
      );
    } catch (e) {
      setTestResult('✗ ' + String(e));
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    if (!apiKey) {
      show('请输入 API Key');
      return;
    }
    const r = await fetch('/api/llm/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey }),
    });
    const j = await r.json();
    if (r.ok) {
      show('✓ 已保存');
      setConfigured(true);
      setApiKey('');
    } else {
      show(j.error || '保存失败');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-dim">提供商</label>
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
              ? '已配置 ✓ ••••（留空保持不变，输入则更新）'
              : '粘贴 API Key，如 ark-... / sk-...'
          }
          className="w-full rounded-md bg-bg-card px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-dim">模型</label>
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
          测试连接
        </button>
        <button
          onClick={onSave}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold"
        >
          保存
        </button>
      </div>

      {testResult && <div className="text-xs text-text-dim">{testResult}</div>}

      <p className="text-[11px] leading-relaxed text-text-muted">
        此配置作用于 Copilot、个股 AI 观点与 DCF 假设填充等需要登录的 AI 功能；
        每日简报/雷达推送为定时任务，使用平台统一模型。未配置时全部功能回落平台默认。
      </p>
    </div>
  );
}
