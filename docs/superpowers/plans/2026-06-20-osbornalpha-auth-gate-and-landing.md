# osbornalpha 门禁 + 营销落地页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 osbornalpha 从"无门禁、陌生人可浏览整个产品"改造为"公开营销落地页 + 登录后才能进入产品"。

**Architecture:** Next.js App Router 路由组。`/` 变公开营销落地页;产品页移入受保护路由组 `(app)`(URL 不变),由 `(app)/layout.tsx` 服务端 auth 守卫 + `middleware.ts` 重定向双保险。品牌统一 osbornalpha。

**Tech Stack:** Next.js 14 App Router, @supabase/ssr, TypeScript, Tailwind. 验证以 `npm run typecheck` + `npm run build` + 运行时门禁检查为主(路由/中间件不适合单测 TDD)。

参考规格: `docs/superpowers/specs/2026-06-20-osbornalpha-auth-gate-and-landing-design.md`

---

### Task 1: 品牌统一为 osbornalpha

**Files:**
- Modify: `src/components/TopBar.tsx:12-14`
- Modify: `src/app/layout.tsx:15-23`

- [ ] **Step 1: 改 TopBar 品牌名与链接**

`src/components/TopBar.tsx` 把 logo 块改为(链接指向工作台 /dashboard):

```tsx
      <Link href="/dashboard" className="text-lg font-bold text-text">
        osborn<span className="text-accent">alpha</span>
      </Link>
```

- [ ] **Step 2: 改根 layout 的 metadata 品牌**

`src/app/layout.tsx` metadata/appleWebApp:

```tsx
export const metadata: Metadata = {
  title: { default: 'osbornalpha · AI 投资监控工作台', template: '%s · osbornalpha' },
  description: 'AI 投资监控工作台 · 个人股票池每日 AI 监控 · A 股 / 港股 / 美股',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'osbornalpha' },
};
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 2: 新建受保护路由组 `(app)` + 服务端 auth 守卫 + 下沉 app 外壳

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/layout.tsx` (从 body 移除 TopBar/TabBar/main 外壳)

- [ ] **Step 1: 创建 `(app)/layout.tsx`(服务端守卫 + 外壳)**

```tsx
import { redirect } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { TabBar } from '@/components/TabBar';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

// 受保护路由组:未登录一律挡在外面(中间件已先拦,这里是兜底)。
// Supabase 未配置时(本地无 env)放行,避免开发期锁死。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (serverIsSupabaseConfigured()) {
    const sb = await getServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect('/login');
  }
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">{children}</main>
      <TabBar />
    </>
  );
}
```

- [ ] **Step 2: 从根 layout 移除外壳(只留全局壳与 ToastProvider)**

`src/app/layout.tsx` 的 `<body>` 改为:

```tsx
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
```

并删除顶部不再使用的 import:`import { TopBar } from '@/components/TopBar';` 和 `import { TabBar } from '@/components/TabBar';`。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS(此时 `/` 等页面暂时没有外壳,Task 3 迁移后恢复)

---

### Task 3: 迁移产品页进 `(app)`,工作台 `/` → `/dashboard`

**Files:**
- Move: `src/app/page.tsx` → `src/app/(app)/dashboard/page.tsx`
- Move: `src/app/watchlist/` → `src/app/(app)/watchlist/`
- Move: `src/app/radar/` → `src/app/(app)/radar/`
- Move: `src/app/briefs/` → `src/app/(app)/briefs/`
- Move: `src/app/backtest/` → `src/app/(app)/backtest/`
- Move: `src/app/settings/` → `src/app/(app)/settings/`

- [ ] **Step 1: git mv 迁移(路由组不改 URL,/page.tsx 改成 /dashboard)**

```bash
cd stock-monitor
mkdir -p "src/app/(app)/dashboard"
git mv src/app/page.tsx "src/app/(app)/dashboard/page.tsx"
git mv src/app/watchlist "src/app/(app)/watchlist"
git mv src/app/radar "src/app/(app)/radar"
git mv src/app/briefs "src/app/(app)/briefs"
git mv src/app/backtest "src/app/(app)/backtest"
git mv src/app/settings "src/app/(app)/settings"
```

- [ ] **Step 2: 确认 import 路径不受影响**

迁移的页面用的是 `@/` 绝对别名(非相对路径),路由组不改变 `@/` 解析,无需改 import。
Run: `grep -rn "from '\.\./" "src/app/(app)"` — Expected: 无相对上跳 import(若有则逐个修正为 `@/`)。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 4: TabBar / 导航指向 /dashboard

**Files:**
- Modify: `src/components/TabBar.tsx` (home tab href + active 判定)

- [ ] **Step 1: home tab 改 href**

`TABS` 第一项 `home` 的 `href: '/'` 改为 `href: '/dashboard'`。

- [ ] **Step 2: active 判定改 /dashboard**

`TabBar()` 内 active 计算改为:

```tsx
        const active =
          (t.href === '/dashboard' && pathname === '/dashboard') ||
          (t.href !== '/dashboard' && pathname.startsWith(t.href));
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 5: 登录后流向 + 去除访客入口

**Files:**
- Modify: `src/components/AuthForm.tsx:37`
- Modify: `src/app/auth/callback/route.ts:7`
- Modify: `src/app/login/page.tsx:49`

- [ ] **Step 1: AuthForm 登录成功跳 /dashboard**

`src/components/AuthForm.tsx` 把 `window.location.href = '/';` 改为 `window.location.href = '/dashboard';`

- [ ] **Step 2: OAuth/邮件回调默认落 /dashboard**

`src/app/auth/callback/route.ts` 把 `const next = searchParams.get('next') || '/';` 改为 `const next = searchParams.get('next') || '/dashboard';`

- [ ] **Step 3: 删除登录页"继续访客模式"入口**

`src/app/login/page.tsx` 删除含 `← 返回（继续访客模式）` 的那行(line 49 附近的 `<div className="mt-3">...</div>`)。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 6: middleware 真门禁

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: 重写 middleware 为门禁**

整文件替换为:

```tsx
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// 公开路径(未登录可访问)。其余一律需登录。
const PUBLIC_PATHS = new Set([
  '/', '/about', '/login', '/register', '/forgot-password', '/reset-password',
]);
function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/auth/')) return true;        // OAuth/邮件回调
  if (pathname.startsWith('/api/')) return true;          // API 自带 RLS/鉴权
  return false;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey || sbUrl.includes('placeholder')) return response; // 未配置:放行(本地开发)

  const supabase = createServerClient(sbUrl, sbKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as any));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  // 已登录访问登录/注册 → 工作台
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  // 未登录访问受保护页 → 登录(带回跳)
  if (!user && !isPublic(pathname)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 7: 营销落地页 `/`(Claude Design 高保真)

**Files:**
- Create: `src/app/page.tsx`(根公开落地页,不带 app 外壳)
- Create (按需): `src/components/landing/*`(落地页分区组件)

- [ ] **Step 1: 用 frontend-design skill 生成深色高保真落地页**

调用 `frontend-design` skill,产出 `src/app/page.tsx`(及必要的 `src/components/landing/` 子组件),要求:
- 深色主题,延续 app 视觉(globals.css 的 theme-dark / accent / bg-elevated 等 token,字体 Geist)。
- 分区(严格按规格 §7):
  1. Hero:`osbornalpha — 你的 AI 投资 PM`;副标「选股、监控、决策,一个工作台搞定」;CTA `免费注册`(→ /register)、`登录`(→ /login);市场标签 A股·港股·美股。
  2. 功能 ×4:个人股票池+每日 AI 简报 / AI 投资委员会(多大师视角) / 信号雷达+回测 / John Cameron PM 决策。
  3. 定价:Free(¥0)与 Pro(标「即将上线」)。
  4. 免责声明(复用 `src/components/Disclaimer.tsx` 文案)+ 页脚。
- 已登录用户:Hero CTA 显示「进入工作台」(→ /dashboard)替代登录/注册。实现:服务端读取 `getServerSupabase().auth.getUser()`(Supabase 配置时),把 `isAuthed` 传给 hero。未配置或未登录则显示登录/注册。
- 页面为公开页,**不**渲染 TopBar/TabBar。

- [ ] **Step 2: 落地页冒烟**

Run: `npm run build`
Expected: 构建成功,`/` 为静态/动态落地页,无对 app 外壳的引用错误。

- [ ] **Step 3: commit(restructure + landing 一起,保证可构建)**

```bash
git add -A
git commit -m "feat(auth): gate app behind login + public osbornalpha landing (route group (app))"
```

---

### Task 8: 验收(运行时门禁检查)

**Files:** 无(运行验证)

- [ ] **Step 1: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 双绿。

- [ ] **Step 2: 本地起服 + 门禁验证(preview 工具)**

启动 dev server,逐项核对规格 §9:
- 未登录访问 `/dashboard`、`/watchlist` → 302/跳转到 `/login?next=...`。
- `/` 落地页对未登录可见(显示登录/注册 CTA)。
- 登录后访问 `/dashboard` 正常;访问 `/login` → 跳 `/dashboard`。
- (线上)两账号 RLS 隔离回归不变。

验证方式:用 preview_* 工具加载页面、检查跳转与快照;或对受保护路径 `curl -I` 看 307/location。

- [ ] **Step 3: 修复任何不符并重跑 Step 1-2。**

---

### Task 9: 部署 + 收尾

**Files:** 无

- [ ] **Step 1: 推分支 + 开 PR(经用户确认后)**

```bash
git push -u origin feat/auth-gate-landing
gh pr create --fill --base main
```

- [ ] **Step 2: 合并后重新部署 osbornalpha**

```bash
vercel --prod --yes
```

- [ ] **Step 3: 线上冒烟**

打开 https://www.osbornalpha.com —— 未登录看到**落地页**(而非产品);点登录可进 `/dashboard`。

- [ ] **Step 4: 更新 OSStack 卡为 done。**

---

## Self-Review

- 规格覆盖:门禁模型(Task 2/6)、Approach A 路由组(Task 2/3)、品牌(Task 1)、登录流向+去访客(Task 5)、落地页+定价(Task 7)、移除 guest(Task 5/6)、验收(Task 8)、部署(Task 9)。文档包为独立卡 `card_d65f3891`,不在本计划。✓
- 占位符:无 TBD/TODO;落地页为创意任务,已用 frontend-design skill + 明确分区/验收替代逐行代码(可接受)。
- 类型一致:`/dashboard` 在 middleware/AuthForm/callback/TabBar/TopBar/(app) 守卫中一致;`isPublic` 白名单与规格 §4 一致。
