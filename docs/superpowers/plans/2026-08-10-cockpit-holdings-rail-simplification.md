# Cockpit Holdings Rail Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a clear master-detail cockpit by limiting each left-rail holding row to stock identity and unrealized P&L while preserving native-currency market summaries and full position details in the center panel.

**Architecture:** `PositionsRail` remains responsible for market grouping, aggregate market value, aggregate unrealized P&L, and selecting a ticker. `FocusPanel` remains the sole owner of selected-stock quantity, individual market value, current/average price, and P&L detail. The page grid narrows the desktop positions rail from 360px to 320px.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Playwright.

---

### Task 1: Lock the simplified information hierarchy into the browser test

**Files:**
- Modify: `e2e/portfolio-grouped-holdings.spec.ts`

- [x] **Step 1: Add rail-specific locators and negative assertions**

Scope each market group with `data-market-group` and each stock row with `data-position-ticker`. Assert that the market aggregates and stock identity/P&L remain, and that the stock row does not contain labels for quantity, individual market value, current price, or average price.

```ts
const cn = page.locator('[data-market-group="A"]');
const perfectWorld = cn.locator('[data-position-ticker="002624.SZ"]');

await expect(perfectWorld).toContainText('完美世界');
await expect(perfectWorld).toContainText('002624.SZ');
await expect(perfectWorld).toContainText('+5.88%');
await expect(perfectWorld).not.toContainText(/持仓数量|Shares Held/);
await expect(perfectWorld).not.toContainText(/现价|Current Price/);
```

- [x] **Step 2: Run the focused Playwright test and confirm it fails**

Run: `npx playwright test e2e/portfolio-grouped-holdings.spec.ts`

Expected: FAIL because the new `data-market-group` and `data-position-ticker` hooks do not exist yet.

### Task 2: Simplify each holding row and narrow the rail

**Files:**
- Modify: `src/components/portfolio/PositionsRail.tsx`
- Modify: `src/app/(app)/portfolio/page.tsx`

- [x] **Step 1: Add stable semantic hooks to market groups and position rows**

```tsx
<section data-market-group={group.market} ...>
  <button data-position-ticker={position.ticker} ...>
```

- [x] **Step 2: Remove repeated position and price fields from each stock row**

Delete the per-row `marketValue` calculation, the three-column `PositionDatum` grid, and the now-unused `PositionDatum` helper. Keep the name, ticker, P&L amount, and P&L percentage so the rail remains useful for fast scanning.

- [x] **Step 3: Strengthen the selected-row treatment without a glow**

Keep the two-pixel accent edge and add a semantic selected state plus a subtle inset ring:

```tsx
aria-pressed={focus === position.ticker}
className={cn(
  'w-full border-l-2 border-transparent px-2.5 py-2 text-left hover:bg-[var(--bg-card)]',
  focus === position.ticker && 'border-[var(--accent)] bg-[var(--bg-card)] ring-1 ring-inset ring-[var(--border)]',
)}
```

- [x] **Step 4: Narrow the desktop left column**

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
```

- [x] **Step 5: Run the focused browser test**

Run: `npx playwright test e2e/portfolio-grouped-holdings.spec.ts`

Expected: PASS; the rail contains native-currency market summaries and compact stock rows, while the center still shows quantity and current/average price.

### Task 3: Verify and release

**Files:**
- Verify only; no additional source files expected.

- [x] **Step 1: Run static and unit quality gates**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [x] **Step 2: Run release safety gates**

Run: `npm audit --audit-level=high && npm run preflight:release`

Expected: no high-severity vulnerability and preflight passes.

- [x] **Step 3: Inspect the desktop cockpit screenshot**

Run the focused Playwright test with a screenshot at desktop width and confirm the 320px rail, native-currency group totals, compact rows, selected state, and center metric cards are legible.

- [ ] **Step 4: Commit and publish**

Commit the plan, test, and source changes with `feat: simplify cockpit holdings rail`, push `main`, deploy the verified build to production, and confirm `https://osbornalpha.com` responds successfully while `/portfolio` retains its authentication gate.
