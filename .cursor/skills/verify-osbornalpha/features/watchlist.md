# Guest watchlist (股票池)

`/watchlist` (src/app/(app)/watchlist/page.tsx). Kanban and table views of the user's boards, with live batch quotes (`/api/quote/batch`, 60 s refresh), and search-and-add through `/api/search`. Without Supabase it is a guest watchlist kept in `localStorage` key `stock-monitor:watchlist:v2`.

## Sub-features
- Default guest list (39 tickers across boards 长期持有 / 机会跟踪 / 仅观察 / …) shown on first visit. It is not written to `localStorage` until the user changes something.
- View switch `📋 看板` / `📊 表格` (persisted as `stock-monitor:watchlist:view`).
- Add: `＋ 加入股票` on a board → type into the `代码 / 名称（如 完美世界 / AAPL / 600519）` box → click the result button `<市场> <名称> <ticker> · <类型>`. Then the card appears, the post-add panel (`aria-label="已开始监控 <ticker>"`) shows, and its text moves from `已加入股票池，行情暂不可用。` to `当前涨幅/跌幅 …` once the batch quote lands.
- Duplicate add → toast `<ticker> 已经在股票池中`, no second card.
- Not yet driven: remove (`⋯` → `🗑 从股票池移除`, uses a `confirm()` dialog), move between boards, drag-and-drop, add/rename/delete board, `📥 批量导入`, `📤 导出` YAML, the empty-state onboarding (`搜索并添加` / `使用示例股票池`, only shown when the stored list is empty).

## How to get to it (user POV)
Top nav → 股票池, or open `/watchlist`. Switch to 📋 看板 to get the per-board `＋ 加入股票` buttons.

## Driving it with CDP browser
`node $S/drive.mjs watchlist` (guest mode only). Fresh context → `/watchlist` → asserts heading `📋 股票池` and that `300750.SZ` (宁德时代, in `MOCK_UNIVERSE` but not in the default list) is absent → clicks `📋 看板` → first `＋ 加入股票` → fills `300750` → clicks the button `/宁德时代.*300750\.SZ/`. Then it checks that exactly one `a[href="/stock/300750.SZ"]` exists, the post-add panel is visible, `localStorage` contains the ticker (saved to `watchlist-localStorage-after-add.json`), the panel shows a live move within 40 s, and the `📊 表格` row for the ticker shows a `¥` price. Next it reloads (the ticker must persist), then repeats the add on the second board (expects the duplicate toast, still one card). Screenshots `watchlist-1-initial` … `-4-duplicate`.

## Gotchas
- The `👤 访客模式` banner renders only when Supabase **is** configured and nobody is signed in. In guest mode (Supabase unset) there is no banner, so do not assert it.
- The kanban card's price is **outside** the `<a href="/stock/…">` link (it is in the sibling row of `StockCard`). Read prices from the table view or the post-add panel, not from the link text.
- Right after the click the panel says `行情暂不可用`, because the batch refetch for the new ticker set lands about 5–15 s later. Poll; do not assert immediately.
- In guest mode, search results come from the built-in `developer-fallback` (`MOCK_UNIVERSE`, about 50 names), not the production security master, so a real ticker outside that list returns nothing. That is expected locally, not a bug.
- `/api/quote/batch` silently caps at 40 tickers per request. The client chunks by 10, so the UI is fine.
- Not available in gate mode: `/watchlist` redirects to `/login`.
