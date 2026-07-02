'use client';

import { useEffect, useState } from 'react';
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
      <h1 className="mb-1 text-xl font-bold">🏛️ 一级市场工作台</h1>
      <p className="mb-4 text-sm text-text-dim">
        研究骨架——配合外部检索使用。生成确定性大纲后自行补充检索结果，产出可存入档案。
      </p>

      <div className="space-y-3">
        <OutlineWizard
          icon="📋"
          title="IC Memo 大纲"
          desc="8 节标准投资上会报告骨架：项目概述 → 交易结构 → 行业 → 标的分析 → 财务估值 → 亮点协同 → 风险 → 建议与退出。"
          skillId="ic-memo"
          fields={[
            { key: 'target', label: '标的公司 / 项目名称', placeholder: '如：隼鹰科技', required: true },
            { key: 'dealContext', label: '已知交易背景/条款（可选）', placeholder: '如：现金收购，估值 10 亿', textarea: true },
          ]}
          generate={(v) => icMemoOutline(v.target, v.dealContext)}
        />

        <OutlineWizard
          icon="📊"
          title="PE Portfolio 大纲"
          desc="3 节基金组合骨架：基金与组合概览 → 主要被投项目明细 → 近期动态与退出。"
          skillId="pe-portfolio"
          fields={[
            { key: 'fund', label: '基金 / 机构名称', placeholder: '如：某某创投基金', required: true },
          ]}
          generate={(v) => pePortfolioOutline(v.fund)}
        />

        <OutlineWizard
          icon="🕵️"
          title="LP 追踪大纲"
          desc="每个追踪对象一节，覆盖新增投资/市场拓展/撤资退出/投资成果/对外表态五类动向。最多 20 个对象。"
          skillId="lp-tracking"
          fields={[
            { key: 'names', label: '追踪对象（每行一个，最多 20 个）', placeholder: '机构A\n机构B', required: true, textarea: true },
            { key: 'windowLabel', label: '追踪窗口（可选，默认「近一个月」）', placeholder: '如：近一周' },
          ]}
          generate={(v) =>
            lpTrackingOutline(
              v.names.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean),
              v.windowLabel,
            )
          }
        />
      </div>

      <Panel title="📁 一级市场档案" className="mt-4">
        {err && <div className="text-xs text-down">加载失败：{err}</div>}
        {!err && artifacts === null && <div className="text-xs text-text-muted">加载中…</div>}
        {!err && artifacts !== null && artifacts.length === 0 && (
          <div className="text-xs text-text-muted">还没有存档。生成大纲并「存入档案」后，会显示在这里。</div>
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
