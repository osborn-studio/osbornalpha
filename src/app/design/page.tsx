// Dev showcase for the V3 design system: every primitive rendered in the
// reading tier (left) and inside a data-density Panel (right).
import { Button, Card, Panel, Metric, Tag } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">V3 Design System</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 text-sm text-[var(--text-dim)]">Reading tier (Card)</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button>买入</Button>
            <Button variant="danger">卖出</Button>
            <Button variant="secondary" size="sm">观望</Button>
            <Button variant="ghost" size="sm">更多</Button>
          </div>
          <div className="mt-4 flex gap-4">
            <Metric label="目标价" value="¥520.00" />
            <Metric label="今日" value="+2.41%" change={2.41} />
            <Metric label="回撤" value="-4.10%" change={-4.1} />
          </div>
          <div className="mt-4 flex gap-2">
            <Tag tone="up">突破</Tag>
            <Tag tone="down">跌破MA20</Tag>
            <Tag tone="accent">未平决策</Tag>
            <Tag>观察</Tag>
          </div>
        </Card>

        <Panel title="Data tier (Panel)">
          <div className="flex gap-[var(--row-gap)]">
            <Metric label="持仓成本" value="443.10" />
            <Metric label="现价" value="480.20" change={2.41} />
            <Metric label="浮盈" value="+8.37%" change={8.37} />
          </div>
          <div className="mt-[var(--row-gap)] flex gap-1">
            <Tag tone="up">🔴 放量突破</Tag>
            <Tag tone="accent">MA20回踩</Tag>
          </div>
          <div className="mt-[var(--row-gap)]">
            <Button size="sm">记录决策</Button>
          </div>
        </Panel>
      </section>
    </div>
  );
}
