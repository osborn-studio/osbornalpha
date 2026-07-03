# P6a 旧路由跳转 + E2E 冒烟 Implementation Plan

> superpowers:subagent-driven-development or executing-plans。

**Goal:** ① `/dashboard` → `/today` 永久跳转（功能已被 /today+驾驶舱取代，站内已无入口指向它）；② Playwright E2E 冒烟套件（未登录路径全覆盖 + 有凭据时的登录主链路，凭据缺失自动 skip）。

**Scope decisions:** `/radar` `/briefs` `/backtest` `/skills` 保留可直达（内容未被完整复制，/tools 门户与 /today 仍链向部分页面）——不做 301。V1 主题删除不在本期（等用户视觉验收 V2）。dashboard 页面文件**不物理删除**（redirect 已使其不可达；连带组件清理归入将来的 V1 删除批次）。

---

### Task 1: /dashboard 永久跳转

`next.config.mjs` 加：
```js
async redirects() {
  return [{ source: '/dashboard', destination: '/today', permanent: true }];
},
```
grep 全站 `'/dashboard'` 引用确认无功能残链（middleware 注释、已改的 error/TopBar 等不算）。
Gates: `npm run build` 干净；`npm test` 184。
Commit: `feat(cleanup): permanent redirect /dashboard → /today`

### Task 2: Playwright 冒烟

- `npm i -D @playwright/test` + `npx playwright install chromium`。
- `playwright.config.ts`：testDir `./e2e`，baseURL `process.env.E2E_BASE_URL ?? 'http://localhost:3000'`，webServer `{ command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120000 }`（E2E_BASE_URL 指向远端时不起 webServer——条件展开）。
- `e2e/smoke.spec.ts`（未登录，恒跑，7 用例）：
  1. `/` 200 含 osbornalpha；2. `/design` 200 含 "V3 Design System"；3. `/portfolio` 落 `/login?next=%2Fportfolio`（或 next=/portfolio——按实际编码断言 URL 含 /login 且 next 含 portfolio）；4. `/today` 落 login；5. `/dashboard` 经 308 最终落 login 且 next 含 today；6. `GET /api/portfolio` 返回 401 且 body 是 JSON `{error}`；7. `/login` 邮箱与密码输入框可见。
- `e2e/authed.spec.ts`：顶部 `test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'no credentials')`；登录表单流 → 落 /today → 依次访问 /watchlist /intel /portfolio /tools 断言关键元素（今日 h1、股票池表格、发现 tab、三栏容器、四卡）；**只读**——不提交任何写操作。
- package.json：`"e2e": "playwright test"`；`.gitignore` 加 `playwright-report/`、`test-results/`。
- vitest 隔离确认：vitest include 是 `src/**/*.test.ts`，e2e 用 `.spec.ts` 且在 `e2e/`——互不干扰。
Gates: 本地 `npm run e2e`（dev server 复用）：7 pass + authed skipped；`npm test` 184 不动；build 干净。
Commit: `feat(e2e): playwright smoke suite (public paths + optional authed flow)`

### Task 3: 终审 + 合并

报告须附 E2E 实跑输出（7 passed, N skipped）。
