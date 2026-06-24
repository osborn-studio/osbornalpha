import Link from 'next/link';
import { METHODS } from '@/lib/agent/methods/registry';
import { TOOLS, type AgentTool } from '@/lib/agent/tools';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

export const metadata = { title: '技能中心' };

const CATEGORIES: AgentTool['category'][] = ['行情', '研究', '估值', '资金'];
const CATEGORY_ICON: Record<AgentTool['category'], string> = {
  行情: '📈', 研究: '🔬', 估值: '🧮', 资金: '💰',
};

export default function SkillsPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">🧰 技能中心 · Skill Hub</h1>
      <p className="mb-4 text-sm text-text-dim">
        Copilot 的能力清单：可执行的分析方法 + 它能调用的工具。
      </p>

      {/* Methods — executable workflows */}
      <div className="mb-2 text-sm font-semibold text-text-dim">🪜 分析方法</div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {METHODS.map((m) => (
          <Link key={m.id} href={m.href as any}
            className="card-base block transition-colors hover:bg-bg-card">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-lg">{m.icon}</span>{m.name}
            </div>
            <div className="mt-1 text-xs text-text-muted">{m.description}</div>
            <div className="mt-2 text-xs font-semibold text-accent">运行 →</div>
          </Link>
        ))}
      </div>

      {/* Tools — capabilities the agent can call */}
      <div className="mb-2 text-sm font-semibold text-text-dim">🔧 工具</div>
      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const tools = TOOLS.filter((t) => t.category === cat);
          if (tools.length === 0) return null;
          return (
            <div key={cat} className="card-base">
              <div className="mb-2 text-sm font-semibold">{CATEGORY_ICON[cat]} {cat}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map((t) => (
                  <div key={t.name} className="rounded-md bg-bg-card px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <code>{t.name}</code>
                      {t.aShareOnly && <span className="rounded bg-bg-elevated px-1 text-[10px] text-text-dim">A 股</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-muted">{t.description}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-text-muted">
        共 {TOOLS.length} 个工具 · {METHODS.length} 个方法。工具由 Copilot 在推理时按需调用。
      </p>
    </>
  );
}
