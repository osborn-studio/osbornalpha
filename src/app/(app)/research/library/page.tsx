'use client';

import { useMemo, useState } from 'react';
import { Disclaimer } from '@/components/Disclaimer';
import {
  EARNINGS_RESEARCH_SKILL,
  buildResearchCommand,
  searchResearchReports,
} from '@/lib/research/library';

const statusLabel = {
  'template-ready': '模板就绪',
  drafting: '撰写中',
  published: '已发布',
};

export default function ResearchLibraryPage() {
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('Micron Technology');
  const [ticker, setTicker] = useState('MU');
  const [period, setPeriod] = useState('FY2026 Q3');

  const reports = useMemo(() => searchResearchReports(query), [query]);
  const command = useMemo(() => buildResearchCommand(company, ticker, period), [company, ticker, period]);

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">研究库</h1>
          <div className="mt-1 text-xs text-text-dim">
            Earnings research books · source PDFs · references database · incremental chapters
          </div>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索公司、ticker、主题、财期"
          className="w-full lg:w-[360px]"
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="报告" value={String(reports.length)} />
        <Stat label="Skill" value={EARNINGS_RESEARCH_SKILL.name} />
        <Stat label="引用库" value="JSON + BibTeX" />
        <Stat label="章节" value="13" />
      </div>

      <section className="card-base">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-text-dim">生成研究书</div>
          <code className="rounded bg-bg-card px-2 py-1 text-[11px] text-text-muted">
            {EARNINGS_RESEARCH_SKILL.id} · local skill
          </code>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_160px]">
          <label className="text-xs text-text-dim">
            公司
            <input value={company} onChange={(event) => setCompany(event.target.value)} className="mt-1 w-full" />
          </label>
          <label className="text-xs text-text-dim">
            Ticker
            <input value={ticker} onChange={(event) => setTicker(event.target.value)} className="mt-1 w-full" />
          </label>
          <label className="text-xs text-text-dim">
            财期
            <input value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 w-full" />
          </label>
        </div>

        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-bg-card p-3">
          <code className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-text-dim">{command}</code>
        </div>
      </section>

      <section className="card-base !p-0 overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead className="bg-bg-elevated text-text-muted">
            <tr>
              <th className="py-2 pl-3 pr-2 text-left">报告</th>
              <th className="py-2 pr-2 text-left">状态</th>
              <th className="py-2 pr-2 text-right">Sources</th>
              <th className="py-2 pr-2 text-right">Chapters</th>
              <th className="py-2 pr-2 text-left">主题</th>
              <th className="py-2 pr-3 text-right">更新</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-t border-border align-top">
                <td className="py-3 pl-3 pr-2">
                  <div className="font-semibold text-text">{report.company}</div>
                  <div className="mt-0.5 text-[11px] text-text-dim">
                    {report.ticker} · {report.period} · {report.sector}
                  </div>
                  <div className="mt-1 max-w-xl text-[11px] leading-relaxed text-text-muted">{report.summary}</div>
                </td>
                <td className="py-3 pr-2">
                  <span className="rounded border border-border bg-bg-card px-2 py-1 text-[11px] text-text-dim">
                    {statusLabel[report.status]}
                  </span>
                </td>
                <td className="py-3 pr-2 text-right tabular-nums">
                  {report.downloadedSourceCount}/{report.sourceCount}
                </td>
                <td className="py-3 pr-2 text-right tabular-nums">
                  {report.chaptersReady}/{report.chapterCount}
                </td>
                <td className="py-3 pr-2">
                  <div className="flex flex-wrap gap-1">
                    {report.tags.map((tag) => (
                      <span key={tag} className="rounded bg-bg-card px-2 py-0.5 text-[11px] text-text-dim">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-3 text-right text-text-dim">{report.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Disclaimer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-card p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-text">{value}</div>
    </div>
  );
}
