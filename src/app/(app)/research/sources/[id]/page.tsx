'use client';

// Research OS — Source 详情（WP-A8：变化卡断言的 source@version 落点）。
// i18n 豁免：单用户本地研究工具，文案 zh 硬编码。

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { SourceDocument } from '@/lib/research/types';

export default function ResearchSourceDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const citedVersion = search.get('v');
  const [source, setSource] = useState<SourceDocument | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'disabled'>('loading');

  const load = useCallback(async () => {
    const res = await fetch(`/api/research/sources/${params.id}`);
    if (res.status === 401 || res.status === 403) { setState('disabled'); return; }
    if (res.status === 404) { setState('missing'); return; }
    const data = await res.json().catch(() => ({}));
    setSource(data.source ?? null);
    setState(data.source ? 'ok' : 'missing');
  }, [params.id]);
  useEffect(() => { void load(); }, [load]);

  if (state === 'disabled') return <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">Research OS 该模块暂未开放——需以 admin 角色登录后访问。</div>;
  if (state === 'missing') return <p className="text-sm text-gray-500">Source 不存在或不可见。<Link className="underline" href="/research/sources">返回列表</Link></p>;
  if (!source) return <p className="text-sm text-gray-500">加载中…</p>;

  const version = source.source_version ?? '1';
  const versionMismatch = citedVersion !== null && citedVersion !== version;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{source.title}</h1>
        <p className="text-xs text-gray-500">
          {source.source_type} · trust {source.trust_level} · 入库 {source.ingested_at} · 可获得 {source.available_at ?? source.ingested_at} · 版本 {version}
          {source.origin_type ? ` · 来源类别 ${source.origin_type}` : ''}{source.market ? ` · ${source.market}` : ''} · {source.permission ?? 'public'}
        </p>
        {source.url && <p className="text-sm"><a href={source.url} target="_blank" rel="noreferrer" className="underline">原文链接 ↗</a></p>}
        {versionMismatch && (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            卡片引用的是版本 {citedVersion}，当前显示版本 {version}；正文可能已更新。
          </p>
        )}
      </div>
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-base font-medium">正文</h2>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800">{source.raw_text}</pre>
      </section>
      <p className="text-xs text-gray-500">hash {source.content_hash} · <Link className="underline" href="/research/sources">返回列表</Link> · <Link className="underline" href="/research/cards">变化卡</Link></p>
    </div>
  );
}
