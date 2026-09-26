'use client';

// Research OS — 变化卡（WP-A8）。只读：采纳/否决在 A9。
// i18n 豁免：单用户本地研究工具，文案 zh 硬编码。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CARD_FIELDS, CARD_FIELD_LABELS, CARD_PENDING, type CardAssertion, type ResearchCard } from '@/lib/research/types';

const KIND_BADGE: Record<string, string> = { evidence: 'bg-green-100 text-green-800', counter: 'bg-purple-100 text-purple-800' };

function Assertion({ a }: { a: CardAssertion }) {
  return (
    <li>
      {a.text}{' '}
      <Link href={`/research/sources#src-${a.source_id}`} className="text-xs text-gray-500 underline" title={`判断 ${a.judgment_ids.length} 条`}>
        [{a.source_id.slice(0, 8)}@{a.source_version}]
      </Link>
    </li>
  );
}

function Card({ card }: { card: ResearchCard }) {
  const byId = useMemo(() => new Map(card.assertions.map((a) => [a.id, a])), [card.assertions]);
  const blockers = card.axiom_results.filter((r) => !r.passed);
  return (
    <li className={`rounded-lg border p-4 ${card.status === 'blocked' ? 'border-red-300 bg-red-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${KIND_BADGE[card.kind] ?? 'bg-gray-100'}`}>{card.kind === 'counter' ? '反证 / 陌生来源' : '证据'}</span>
        <h3 className="font-medium">{card.title}</h3>
        <Link href={`/research/theses/${card.thesis_id}`} className="text-xs underline">thesis</Link>
        <span className="text-xs text-gray-500">支持 {card.evidence.support} · 反证 {card.evidence.counter} · 独立来源 {card.evidence.independent_sources}{card.evidence.excluded_private ? ` · 私有材料未用 ${card.evidence.excluded_private}` : ''}</span>
      </div>
      {card.status === 'blocked' ? (
        <div className="mt-2 text-sm text-red-900">
          <p>该卡被合规规则拦截，正文不展示：</p>
          <ul className="list-disc pl-5">{blockers.map((b) => <li key={b.axiom_code}>{b.axiom_code}：{b.message}</li>)}</ul>
        </div>
      ) : (
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          {CARD_FIELDS.map((f) => {
            const v = card.fields[f];
            return (
              <div key={f} className="text-sm">
                <dt className="font-medium text-gray-700">{CARD_FIELD_LABELS[f]}</dt>
                <dd>
                  {!v || v === CARD_PENDING ? <span className="text-gray-400">{CARD_PENDING}</span> : (
                    <ul className="list-disc space-y-0.5 pl-5">{(v as string[]).map((id) => byId.get(id)).filter((a): a is CardAssertion => !!a).map((a) => <Assertion key={a.id} a={a} />)}</ul>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="mt-3 text-xs text-gray-500">
        {card.evidence.uncertainty} · 模型 {card.generation.model} · {card.generation.unsupported_dropped ? `丢弃无引用断言 ${card.generation.unsupported_dropped} 条 · ` : ''}生成于 {card.generation.generated_at}
      </p>
    </li>
  );
}

export default function ResearchCardsPage() {
  const [cards, setCards] = useState<ResearchCard[]>([]);
  const [disabled, setDisabled] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch('/api/research/cards');
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    const data = await res.json().catch(() => ({ cards: [] }));
    setCards(data.cards ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const weeks = useMemo(() => {
    const m = new Map<string, ResearchCard[]>();
    for (const c of cards) (m.get(c.week_of) ?? m.set(c.week_of, []).get(c.week_of)!).push(c);
    return [...m.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [cards]);
  if (disabled) return <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。</div>;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">变化卡（{cards.length}）</h1>
      <p className="text-sm text-gray-600">每周 ≤5 张，其中 1 张反证/陌生来源。卡片不含买卖建议、仓位、目标价；每条断言可点开原文（source@version）。采纳/影子/否决在后续工作包。</p>
      {weeks.length === 0 && <p className="text-sm text-gray-500">暂无卡片。本地运行 <code>scripts/research-cards.ts</code> 生成。</p>}
      {weeks.map(([week, list]) => (
        <section key={week}>
          <h2 className="mb-2 text-base font-medium">周 {week}（{list.length}）</h2>
          <ul className="space-y-3">{list.map((c) => <Card key={c.id} card={c} />)}</ul>
        </section>
      ))}
    </div>
  );
}
