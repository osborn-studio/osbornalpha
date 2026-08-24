# P1b 双密度设计系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the V3 dual-density token layer (reading/data tiers switched per-container via `data-density`) and the first five `src/components/ui/` primitives (Button, Card, Panel, Metric, Tag), verified on a dev preview page.

**Architecture:** Density is a small set of CSS variables (`--panel-pad`, `--row-gap`, `--num-font`, `--label-size`, `--value-size`) defined at `:root` (reading defaults) and overridden inside any `[data-density="data"]` container. Components are thin `.tsx` wrappers over pure class-builder functions (`variants.ts`) that ARE unit-testable in the repo's node-env vitest. Visual verification happens on `/design` (auth-gated group, but local dev bypasses auth).

**Tech Stack:** Tailwind 3.4 + CSS vars (existing pattern in `src/app/globals.css`), `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge), vitest (node env — NO jsdom; do not add render-testing infra).

**Scope note (YAGNI):** Table / Modal / DecisionBar from spec §6B are deliberately deferred to P2, where their first consumers (cockpit) appear. This plan delivers the token mechanism + exemplar primitives that P2 patterns on.

---

## File Structure

- Modify: `src/app/globals.css` — append V3 density-token block (do not touch existing V1/V2 blocks)
- Create: `src/components/ui/variants.ts` — pure class builders (unit-tested)
- Create: `src/components/ui/variants.test.ts`
- Create: `src/components/ui/Button.tsx`, `Card.tsx`, `Panel.tsx`, `Metric.tsx`, `Tag.tsx`
- Create: `src/components/ui/index.ts` — barrel export
- Create: `src/app/(app)/design/page.tsx` — dev showcase page (both densities side by side)

---

### Task 1: V3 density tokens

**Files:**
- Modify: `src/app/globals.css` (append at end of file)

- [ ] **Step 1: Append the density token block**

```css
/* ============================================================
 * V3 dual-density layer (2026-07-02 refactor, spec §6B)
 * Reading tier = defaults on :root. Any container with
 * [data-density="data"] switches to the compact numeric tier.
 * Components consume ONLY these five vars for density-aware
 * spacing/typography; colors keep using the V1/V2 vars above.
 * ============================================================ */
:root {
  --panel-pad: 16px;
  --row-gap: 10px;
  --num-font: inherit;
  --label-size: 12px;
  --value-size: 15px;
}

[data-density='data'] {
  --panel-pad: 8px;
  --row-gap: 4px;
  --num-font: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --label-size: 10px;
  --value-size: 13px;
}

/* Numeric text inside any density context */
.num {
  font-family: var(--num-font);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Build check + commit**

Run: `npm run build` — Expected: clean (CSS-only change)
```bash
git add src/app/globals.css
git commit -m "feat(design): V3 dual-density token layer"
```

---

### Task 2: Variant builders (TDD)

**Files:**
- Create: `src/components/ui/variants.test.ts`
- Create: `src/components/ui/variants.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { buttonClasses, tagClasses, metricTrendClass } from './variants';

describe('buttonClasses', () => {
  it('builds primary/md by default', () => {
    const c = buttonClasses();
    expect(c).toContain('bg-[var(--accent)]');
    expect(c).toContain('px-4');
  });
  it('variant + size compose', () => {
    const c = buttonClasses('danger', 'sm');
    expect(c).toContain('text-[var(--down)]');
    expect(c).toContain('px-2.5');
    expect(c).not.toContain('bg-[var(--accent)]');
  });
  it('ghost variant has transparent background', () => {
    expect(buttonClasses('ghost')).toContain('bg-transparent');
  });
});

describe('tagClasses', () => {
  it.each([
    ['up', '--up'],
    ['down', '--down'],
    ['accent', '--accent'],
    ['neutral', '--text-dim'],
  ] as const)('tone %s uses %s', (tone, cssVar) => {
    expect(tagClasses(tone)).toContain(cssVar);
  });
});

describe('metricTrendClass', () => {
  it('maps sign to up/down/neutral', () => {
    expect(metricTrendClass(1.2)).toBe('text-[var(--up)]');
    expect(metricTrendClass(-0.4)).toBe('text-[var(--down)]');
    expect(metricTrendClass(0)).toBe('text-[var(--text-dim)]');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ui/variants.test.ts`
Expected: FAIL — `Cannot find module './variants'`

- [ ] **Step 3: Implement**

```ts
// Pure class builders for the ui primitives. Kept free of React so the
// repo's node-env vitest can unit-test them. Colors come from the V1/V2
// CSS vars; density-aware spacing comes from the V3 vars (globals.css).

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-hover)]',
  danger:
    'bg-transparent text-[var(--down)] border border-[var(--down)] hover:bg-[var(--down)]/10',
  ghost: 'bg-transparent text-[var(--text-dim)] hover:text-[var(--text)]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra);
}

export type TagTone = 'up' | 'down' | 'accent' | 'neutral';

const TAG_TONES: Record<TagTone, string> = {
  up: 'text-[var(--up)] border-[var(--up)]/40',
  down: 'text-[var(--down)] border-[var(--down)]/40',
  accent: 'text-[var(--accent)] border-[var(--accent)]/40',
  neutral: 'text-[var(--text-dim)] border-[var(--border)]',
};

export function tagClasses(tone: TagTone = 'neutral', extra?: string) {
  return cn(
    'inline-flex items-center rounded px-1.5 py-0.5 border bg-transparent',
    'text-[length:var(--label-size)] leading-tight',
    TAG_TONES[tone],
    extra,
  );
}

export function metricTrendClass(change: number): string {
  if (change > 0) return 'text-[var(--up)]';
  if (change < 0) return 'text-[var(--down)]';
  return 'text-[var(--text-dim)]';
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/ui/variants.test.ts` — Expected: 7 passed
Then: `npm test` — Expected: 121 passed

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/variants.ts src/components/ui/variants.test.ts
git commit -m "feat(ui): variant class builders with unit tests"
```

---

### Task 3: The five primitives + barrel

**Files:**
- Create: `src/components/ui/Button.tsx`, `Card.tsx`, `Panel.tsx`, `Metric.tsx`, `Tag.tsx`, `index.ts`

- [ ] **Step 1: `Button.tsx`**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './variants';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...rest} />;
});
```

- [ ] **Step 2: `Card.tsx`** (reading-tier container) **and `Panel.tsx`** (density-aware container)

```tsx
// Card.tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-[var(--panel-pad)]', className)}
      {...rest}
    />
  );
}
```

```tsx
// Panel.tsx — a Card that flips its subtree into the compact data tier.
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function Panel({ title, className, children, ...rest }: PanelProps) {
  return (
    <div
      data-density="data"
      className={cn('rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-[var(--panel-pad)]', className)}
      {...rest}
    >
      {title ? (
        <div className="mb-[var(--row-gap)] text-[length:var(--label-size)] uppercase tracking-wider text-[var(--text-dim)]">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `Metric.tsx` and `Tag.tsx`**

```tsx
// Metric.tsx — label + numeric value + optional trend coloring.
import { cn } from '@/lib/utils';
import { metricTrendClass } from './variants';

export interface MetricProps {
  label: string;
  value: string;
  change?: number; // sign drives color; omit for neutral value
  className?: string;
}

export function Metric({ label, value, change, className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[length:var(--label-size)] text-[var(--text-dim)]">{label}</span>
      <span className={cn('num text-[length:var(--value-size)]', change !== undefined ? metricTrendClass(change) : 'text-[var(--text)]')}>
        {value}
      </span>
    </div>
  );
}
```

```tsx
// Tag.tsx
import type { HTMLAttributes } from 'react';
import { tagClasses, type TagTone } from './variants';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
}

export function Tag({ tone = 'neutral', className, ...rest }: TagProps) {
  return <span className={tagClasses(tone, className)} {...rest} />;
}
```

- [ ] **Step 4: `index.ts`**

```ts
export { Button, type ButtonProps } from './Button';
export { Card } from './Card';
export { Panel, type PanelProps } from './Panel';
export { Metric, type MetricProps } from './Metric';
export { Tag, type TagProps } from './Tag';
export * from './variants';
```

- [ ] **Step 5: Typecheck + build + commit**

Run: `npx tsc --noEmit` then `npm run build` — Expected: clean
```bash
git add src/components/ui
git commit -m "feat(ui): Button/Card/Panel/Metric/Tag primitives"
```

---

### Task 4: /design showcase page

**Files:**
- Create: `src/app/(app)/design/page.tsx`

- [ ] **Step 1: Implement**

```tsx
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
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` — Expected: clean, `/design` in route list
```bash
git add src/app/\(app\)/design
git commit -m "feat(design): /design showcase page for V3 primitives"
```

---

### Task 5: Visual verification (controller does this with preview tools)

- [ ] Start dev server, open `/design`, screenshot both tiers; `preview_inspect` the Panel to confirm `--panel-pad: 8px` and monospace `--num-font` apply inside `[data-density="data"]` and NOT in the Card. Fix any visual defects found, re-verify, commit.
```bash
git push origin main   # after merge back to main
```
