# Macro Workbench (guest view) + allocation template card

`src/app/(app)/macro/page.tsx` → `src/components/macro/MacroWorkbench.tsx`. When `MACRO_JUDGMENTS_ENABLED` is not `1` (`src/lib/macro/flags.ts`), the workbench renders the static `AllocationTemplateCard` (`src/components/macro/AllocationTemplateCard.tsx`, values in `src/lib/macro/allocation-template.ts`, copy in `messages/{zh,en}/macro.json` → `judgment.allocation`) in place of the judgment slot (#231). All other workbench data loads client-side from `/api/macro/*`, which requires a signed-in session (`requireSessionUser`).

## Sub-features
- Heading `宏观工作台` / `Macro workbench`, region toggle (`?region=US|CN`) and tabs `概览 / 指标 / 关联 / 方法与来源`.
- Without a session/DB the overview fails closed with `读取失败：unauthenticated` (`states.loadFailed`). No invented macro data.
- Allocation template card (`<section aria-label="资产配置假设模板">` / `Asset allocation assumption templates`): pills `假设框架 · 未经检验 · 不构成投资建议`, the `静态参考` / `Static reference` marker (shown only when no regime is selected), four regimes in clock order `复苏 过热 滞胀 衰退` / `Recovery Overheat Stagflation Recession`, each with 股票/债券/商品/现金 weights summing to 100% and a tilt note, the Merrill Lynch Investment Clock source note, and the version `macro_allocation_template@v1`. The card is region-independent.
- With judgments enabled and a published F4 card, the same card is shown inside the judgment slot with the selected regime marked `aria-current` / `当前`. Not driveable locally (see Gotchas).

## How to get to it (user POV)
Click `宏观` in the bottom nav (or open `/macro`, `/today`, `/dashboard`). The card sits under the overview notice. Switch `中国 CN` to see that it does not change.

## Driving it with CDP browser
`node $S/drive.mjs macro` (guest mode only; in gate mode `/macro` redirects to login). Three fresh contexts: zh-CN `/macro`, zh-CN `/macro?region=CN`, en-US `/macro`. Each checks the 200 + heading, the card by its accessible region name and the static-reference marker, the four regime names in order, that each regime's four `dd` percentages sum to 100, that no row has `aria-current`, and the version + source note. The zh `/macro` pass also checks the fail-closed `读取失败` notice. Screenshots `macro-zh.png`, `macro-cn.png`, `macro-en.png`.

## Gotchas
- `launch.sh` pins `MACRO_JUDGMENTS_ENABLED=` (empty) so a checkout's dotenv cannot switch the judgment slot on. With it set to `1` and no DB the slot shows its unavailable state instead of this card; that is not what this journey asserts.
- Not provable locally (need a migrated macro DB + signed-in session, or ops credentials): the investment clock, weighted breakdown and clock metadata (#231/#232: the clock takes the highest well-formed `macro_regime` method version and needs exactly one card of it), the Fed liquidity series `WALCL` / `WTREGEN` / `RRPONTSYD` from the unhashed display registry (#227/#233, `src/lib/macro/display-catalog.ts`), CN policy-rate quote events and LPR/AFRE official-HTTP collection (#228, `src/lib/macro/parsers/{chinamoney,pboc-afre}.ts`), `/api/macro/series/[id]` (+ `/versions`), and `POST /api/cron/macro-sync` (cron secret).
- The clock preview (`scripts/preview/macro-clock.ts`, `src/components/macro/ClockPreview.tsx`) is a local esbuild developer preview on captured fixtures, never mounted by Next. It is not a user surface and is not driven here.
