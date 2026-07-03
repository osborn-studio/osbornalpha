# W1 股票池服务端同步（数据丢失修复）+ W3 持仓明细个股入口 Implementation Plan

> superpowers:subagent-driven-development or executing-plans。

**Bug（用户报告，根因已确认）:** 股票池纯 localStorage（`src/lib/watchlist/store.ts` 无任何 Supabase 代码），换设备/清缓存即"消失"回落 mock 默认；`parseWatchlistGroups` 单条校验失败整体丢弃是次级放大器。`watchlists`/`watchlist_items` 表+RLS 自 P1 就存在但前端从未接线。

**Fix 架构：server-first + localStorage 缓存。**
- 新端点 `GET/PUT /api/watchlist/sync`：全快照语义，服务端 `watchlists(name, sort_order)`+`watchlist_items(ticker, sort_order)` ↔ 客户端 `WatchlistGroup[]{id,name,tickers}` 双向映射（服务端 uuid 为准；PUT 按 id-是-uuid 匹配否则按 name upsert，缺席的删除——replace-all/last-writer-wins，单账号场景足够）。
- `useWatchlist` v2：mount 先读 localStorage 立即渲染 → 认证态下 GET sync：服务端有数据→覆盖本地；服务端空且本地≠默认 mock→**一次性迁移** PUT 本地快照上服务端（抢救用户现有池子）；未登录/Supabase 未配→维持纯本地（guest 模式不回归）。写路径：localStorage 乐观写 + 600ms 防抖 PUT（失败静默保留本地，下次机会重试）。
- `parseWatchlistGroups` 改逐条打捞（跳过坏条目而非整体 return null）。

---

## File Structure

- Create: `src/app/api/watchlist/sync/route.ts`（GET/PUT，requireUser 风格同 /api/decisions；PUT 校验 groups 数组形状复用 parseWatchlistGroups 语义、上限 50 组×200 tickers）
- Create: `src/lib/watchlist/sync.ts` + `sync.test.ts`（纯函数 TDD：`serverToGroups(rows)`、`groupsToMutations(current, incoming)`→{deleteIds, upserts, itemsByGroup}、`isDefaultWatchlist(groups)`（与 defaultWatchlistGroups 深比较））
- Modify: `src/lib/watchlist/store.ts`（parseWatchlistGroups 逐条打捞 + 补测试到新文件 `store.test.ts`）
- Modify: `src/lib/hooks/useWatchlist.ts`（v2 逻辑；保持返回签名 {groups, hydrated, setGroups} 不变——全站调用点零改动）
- Modify: `src/app/(app)/portfolio/positions/page.tsx`（W3：两张表的 ticker 单元格 → `<Link href={'/stock/'+encodeURIComponent(t)}>`，决策日志页同样处理 `src/app/(app)/portfolio/decisions/page.tsx`）

## Tasks

1. **纯函数 TDD**（sync.ts + store.ts 打捞改造，≥10 测试：映射双向、mutation 计算含删组/改名/加减 ticker、默认池判定、坏条目打捞保留好条目）。Commit: `fix(watchlist): salvage parsing + pure sync mappers (TDD)`
2. **sync 路由 + hook v2**（离线/未登录路径必须优雅：GET 401/unconfigured → 保持本地；PUT 失败 console.warn 不打断）。手测要点写进代码注释。Commit: `feat(watchlist): server-first sync with one-time local migration`
3. **W3 链接**（ticker 蓝字可点，两页）。Commit: `fix(portfolio): ticker links from positions/decisions to stock page`
4. 终审 + 合并（E2E smoke 不回归；192+新测试）。

**禁触**: `src/app/(app)/stock/[ticker]/page.tsx`（另一 session 正在改它接 consensus——避免合并冲突）。
