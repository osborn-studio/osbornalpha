'use client';

// Research OS — Companies 列表页（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Entity } from '@/lib/research/types';

export default function ResearchCompaniesPage() {
  const [companies, setCompanies] = useState<Entity[]>([]);
  const [themes, setThemes] = useState<Entity[]>([]);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/research/entities?type=COMPANY');
      if (res.status === 501) { setDisabled(true); return; }
      const data = await res.json().catch(() => ({ entities: [] }));
      setCompanies(data.entities ?? []);
      const tRes = await fetch('/api/research/entities?type=THEME');
      const tData = await tRes.json().catch(() => ({ entities: [] }));
      setThemes(tData.entities ?? []);
    })();
  }, []);

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 为本地专用模式，未启用。请在本地 .env.local 设置 RESEARCH_OS_ENABLED=1。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Companies 公司档案（{companies.length}）</h1>
      {companies.length === 0 && (
        <p className="text-sm text-gray-500">
          暂无公司。先运行种子脚本：RESEARCH_OS_ENABLED=1 npx tsx scripts/research-seed.ts
        </p>
      )}
      <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => (
          <li key={c.id}>
            <Link
              href={`/research/companies/${c.id}`}
              className="block rounded-lg border p-3 text-sm hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                {c.ticker && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{c.ticker}</span>}
              </div>
              {c.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{c.description}</p>}
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="text-base font-medium">Themes 主题（{themes.length}）</h2>
      <ul className="flex flex-wrap gap-2">
        {themes.map((t) => (
          <li key={t.id}>
            <Link
              href={`/research/companies/${t.id}`}
              className="inline-block rounded-full border px-3 py-1 text-xs hover:bg-gray-50"
            >
              {t.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
