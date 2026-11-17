You are Codex gpt-6-astra in this repository worktree (OsbornAlpha, Next.js 15 / React 19, macro workbench). Do NOT commit, stash or switch branches. At the end print: files changed, test results, anything you could not do or did not verify.

# Task F1: adopt the shared research foundation on /macro and its sub-routes

The shared foundation is in `src/components/research-ui` (read its `README.md` first, then the components you use). The macro `SourceDrawer` is already migrated (`src/components/macro/source-drawer-adapter.ts` is the adapter example). Your job is the rest of the macro section. Routes: `/macro`, `/macro/[seriesId]`, `/macro/analyses/[runId]`, `/macro/transmission`, `/macro/history`, `/macro/review`, `/macro/review/[region]/[month]`.

## Hard rules
- Failing test first for every behaviour, then implementation. Keep zh and en messages in step (`messages/zh/*.json`, `messages/en/*.json`).
- NEVER edit: `src/lib/macro/{catalog,regime,regime-selection,types,decimal,judgment-contract}.ts`, `src/lib/judgments/**`, `supabase/**`, `src/lib/macro/providers/**`, `parsers/**`, `fixtures/**`, `scripts/macro/**`, `src/components/research-ui/**` (use it as is; if something is missing there, say so in your report instead of changing it). No migrations, no flags, no method/version bumps, no new dependencies.
- `macro_regime@v2` must not change: display-only series stay in the unhashed display registry (`src/lib/macro/display-catalog.ts`, read through `src/lib/macro/series-registry.ts`). The hash-pin tests must stay green. If a pin test goes red, STOP and report; do not update a pin.
- Never write the literal string MACRO_JUDGMENTS_ENABLED in any file under `src/components/macro`.
- Macro code must NOT import the `@/components/research-ui` barrel (`index.ts`): the Playwright fixture bundle in `tests/macro-source-integration` stubs `next/navigation` without `usePathname`. Import each component from its own file, e.g. `@/components/research-ui/PageHeader`, `@/components/research-ui/source-drawer/SourceDrawer`.
- Missing data stays missing: never draw or print 0 for a missing value; restricted/missing sources are labelled as such. No invented numbers: every displayed number comes from an existing API/DTO.
- Styling: existing tokens/CSS variables only, radius <= 6px, no gradients/glow/purple; rise/fall colours only for asset returns.
- This machine has 16 GB RAM and other sessions are working. Run ONE check at a time, never in parallel, and vitest always with `--maxWorkers=2`. Do NOT run `next build` and do NOT run Playwright; I run those.
- Must pass: `npm run typecheck`, `npm run lint`, and `npx vitest run src/components "src/app/(app)/macro" src/lib/macro src/app/api/macro --maxWorkers=2` (the test `src/lib/macro/replay.test.ts` may time out locally; ignore only that one).

## Work items (do them in this order; each is separately testable)

1. **PageHeader + wording.** Every /macro route renders the shared `PageHeader` (title, scope, freshness where the page already knows an as-of date and collection status, legend where marks appear). Remove every user-visible "/intel/macro" wording and every internal link or `router.replace` that still points at `/intel/macro...`; use `/macro...`. (The redirects in `next.config.mjs` stay.) Update the tests that assert the old hrefs.

2. **One tab row.** The tabs 概览 指标 关联 传导 历史 复盘 方法与来源 (en equivalents) are one row of links shown on `/macro` and all its sub-routes, in that order, with the active one marked (`aria-current="page"`). Today the overview has its own tabs and the strategy pages have `StrategyTabs`; unify them into one component. Tabs that are views of the overview page link to `/macro?tab=...` (keep the existing query parameter names and the `region` parameter).

3. **ResearchFooter.** Replace the macro `SourceFooter` usage with the shared `ResearchFooter` on every /macro route: sources (publisher + relay) come from the registry sources of the series actually shown; methods link goes to the methodology tab. Delete `SourceFooter.tsx` if nothing uses it afterwards.

4. **ChartTableSwitch.** Replace every use of `charts/DataTableToggle` with the shared `ChartTableSwitch` (keep the table available beside the chart; use `lineSegments` where a line would otherwise be interpolated across a missing value). Delete `DataTableToggle.tsx` when unused.

5. **Status pills -> StateBadge.** Wherever macro UI shows a status pill or word for missing (`M`), restricted (`R`), stale, revised, quarantined/rejected, render `StateBadge` with the state from `unifiedState(...)`; where a value cell is involved use `StateCell` so that states that must not show a value do not. Keep the reason text that is shown today.

6. **Marks.** The clock card (the judgment slot showing `macro_regime`) is wrapped as `MarkCard kind="judgment"`. The allocation card is `MarkCard kind="hypothesis"` and is named 资产配置假设模板 (en: "Asset allocation hypothesis template") everywhere it is named, never 建议 / advice / recommendation; its template percentages are plain text with no source underline or source button.

7. **Clock decomposition display rows.** In the clock decomposition table for the US region, after the scored rows, add three rows for `US_WALCL`, `US_RRPONTSYD`, `US_WTREGEN` (from the display registry): name, a 展示 / "Display" tag, weight shown as 0, latest value and period if the series endpoint returns one, otherwise the missing state. They are excluded from every total, count and contribution sum; add a test that totals are identical with and without them. They never enter any score. No rows for CN.

8. **联储流动性 fact block** on the overview (US region only), as `MarkCard kind="fact"`: three cards (the same three series), each with latest value, unit, period, and a `ChartTableSwitch` of its history, opening the existing source drawer per value. Data comes through the existing series endpoint/`fetchSeriesWindow` (it already resolves registry ids). Before the first sync (no observations) each card shows the missing state with its reason, never 0 and never an empty axis. Do NOT compute or display any derived "net liquidity" (no WALCL − RRP − TGA, no sum, no difference) and do not use that phrase.

9. **Explanation panel.** `strategy/ExplanationPanel` gets two zones: a facts zone (`MarkCard kind="fact"`) and a hypothesis zone (`MarkCard kind="hypothesis"`). The hypothesis zone is not rendered at all when the explanation status is failed or rejected (the facts zone and the failure note still render).

10. **Remaining drawers.** `strategy/EvidencePairDrawer` and `judgments/InputsDrawer` (find it: `src/components/judgments/InputsDrawer.tsx` or where the macro judgment slot imports it from; if it lives under `src/lib/judgments/**` or is shared with non-macro code, do not edit it, wrap or report instead) use the shared drawer shell `research-ui/source-drawer/SourceDrawer` through a pure adapter (like `source-drawer-adapter.ts`), keeping their current content: pair/ref tables go into slots. Then delete the `macro.drawer.*` message keys that are no longer referenced (check with a search; keep any still used) and update the message tests.

11. `CycleNotes` (history key observations, `macro-cycle-notes/1`) keeps its content and templates unchanged; it only picks up the unified drawer from item 10.

## Report
If an item cannot be done within the rules, leave it undone and say exactly why. List what you did not verify (you cannot launch a browser).
