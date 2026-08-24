# G1c 动态内容本地化 Implementation Plan

> superpowers:subagent-driven-development or executing-plans。Spec: `docs/superpowers/specs/2026-07-03-g1-i18n-design.md` §G1c。

**Goal:** 动态/服务端生成内容按用户语言输出：Copilot 回答语言、API 错误、雷达标签、市场相位、persona 显示名 + 个股页/DcfStudio 补遗抽离。

**Architecture:** 服务端 locale 统一经 `getRequestLocale()`（新，包 next/headers cookies+headers → 现有 resolveLocale 纯函数）；API 错误/生成器标签用**服务端轻字典**（lib 内 zh/en 常量对象，locale 参数默认 'zh' → cron 零影响）；LLM 输出语言用 systemPrompt 追加指令而非翻译 prompt 本体。

---

## Tasks

### T1: 服务端 locale + API 错误本地化
- Create `src/lib/i18n/server.ts`：`getRequestLocale(): Promise<AppLocale>`（cookies/headers → resolveLocale；无请求上下文异常时回落 'zh'）+ `apiMessage(locale, key)` 读内联 API_MESSAGES 字典（keys: quotaExhausted / providerNotConfigured / oversellBlocked / notAuthenticated——zh 取现有文案原文，en 按 GLOSSARY）。
- 接线：3 个配额路由（copilot SSE error message、perspectives quota 响应 error、brief/preview 429）、copilot「未配置 AI Provider」、trades POST/DELETE 的 oversell 中文提示。响应结构不变只换文案。quota 结构化字段照旧（客户端 QuotaNotice 有自己的字典，服务端 message 是兜底展示）。
Commit: `feat(i18n): server locale resolution + localized API messages`

### T2: Copilot 输出语言指令
- copilot route：`const locale = await getRequestLocale()`；`locale==='en'` 时在 method.systemPrompt 末尾追加固定指令块（"IMPORTANT: The user's interface language is English. Write your ENTIRE analysis, all section content, and the final verdict summary in English. Keep the verdict JSON schema keys unchanged."）；zh 不追加。所有方法（john-cameron/deepdive/向导）同点生效。自动存档标题按 locale（`${ticker} Deep Dive` vs 现中文模板——archive title 用 method.name 时保持原样，加 locale 后缀处理从简：title 保持现逻辑，仅正文语言随指令变，注明）。
Commit: `feat(i18n): copilot responds in the user's language`

### T3: 市场相位 + 雷达标签
- `clock.ts`：`aShareMarketPhase` 返回增加结构化字段 `{ phase, minutesTo?: number }` 保留 label（zh 兼容）；新增 `phaseKey/minutes` 供 UI 端 t() 渲染。today/page.tsx 改用 `t('phase.'+phase, {minutes})`（today.json 加 phase.* 键 zh/en；现有 label 路径可删）。clock 测试同步扩展。
- `src/lib/brief/radar.ts`：读文件后将 level_label（关注/留意/平静）、trigger desc 表、headline 模板短语收进 `RADAR_TEXT: Record<AppLocale, {...}>` 内联字典；`buildRadar(..., locale: AppLocale = 'zh')`；`/api/radar/[ticker]` 与 `/api/radar/batch` 传 `await getRequestLocale()`；cron 不传 → zh 不变。工程量以 radar.ts 实际模板数为准——若 headline 模板超过 ~15 条，headline 保持 zh 并在报告中说明（level_label + trigger desc 必须双语）。
Commit: `feat(i18n): market phase + radar labels localized`

### T4: persona 显示名 + 个股页/DcfStudio 补遗
- components.json 加 `personas.{buffett,munger,druckenmiller,marks,lynch,burry,zhang_kun,li_lu,duan_yongping}`（zh 中文名/en 英文名按 GLOSSARY 委员会表）；PerspectiveCard 按 persona id 渲染显示名（读现组件的 props——若只收 name 字符串则由调用方或卡内 id→t 映射，选侵入最小路径）。
- 个股页 `src/app/(app)/stock/[ticker]/page.tsx`（63 行中文）+ `src/components/DcfStudio.tsx` 全量抽离 → market.json 扩展（market.stock.* / market.dcf.*），规则同 G1b 车道（GLOSSARY、插值、mock 数据值留动态）。**禁触 KlineChart.tsx / composer.ts**。
Commit: `feat(i18n): persona display names + stock page & DCF studio extraction`

### T5: 终审 + 合并（coordinator）
E2E 不回归（cron 路径 zh 不变断言可选）；英文会话下 curl 无 MISSING_MESSAGE；review 重点：cron 默认 zh 不受影响、SSE error 结构兼容、radar locale 参数默认值。
