# G2 跨时区 / 多市场时钟 Design

> 全球化战略第二期（G1 i18n ✅ → **G2 本期** → G3 日韩台数据源）。
> 用户决策（2026-07-04 已确认）：① /today 多市场时钟条；② 显示时区=浏览器自动+设置覆盖；③ cron 维持全局北京锚定。

## 目标

全球用户交易 A/HK/US 三市场时：/today 按其持仓+股票池展示各相关市场的开闭市状态与倒计时（美股夏令时正确）；全站时间戳按访问者时区显示、可在设置中覆盖；每日雷达/简报 cron 保持北京锚定，只修显示层与欺骗性 UI。

## 现状（侦察结论）

- `src/lib/today/clock.ts`：纯 A 股（沪深时段硬编码），Intl `formatToParts` 时区法已 DST-safe，唯一消费者是 /today。G1c 已加 `phaseKey/minutes`，`label` 仅为 zh 兼容遗留。
- HK/US 行情早已支持（eastmoney/sina）；`src/lib/portfolio/review.ts:40` 已有 `EXCHANGE_TZ` 三市场映射。
- Cron 两条（daily-radar 00:00 UTC / daily-brief 00:30 UTC = 北京 08:00/08:30），全局广播到 env 配置的 TG/邮箱（owner 通道，非逐用户）。
- `user_preferences.timezone` / `daily_brief_time` 字段已存在但**均未接线**；设置页"简报时间"输入存 localStorage 后无任何消费者（欺骗性 UI），旁边硬编码 "CST (Asia/Shanghai)"。
- 雷达页生成时间 `toLocaleTimeString('zh-CN')` 硬编码；`formatDate(Time)Locale` 隐式用浏览器时区（客户端天然正确）。
- 配额日界 `dayWindowUtc8` 全局 UTC+8。
- **G1 漏网（不入 G2 范围，另立 G1d）**：settings/briefs/backtest/radar/watchlist/error 等页约 900+ CJK 字符未抽离，`settings.json` 仅 2 键零消费者。

## G2a 多市场时钟引擎

`src/lib/today/clock.ts` 泛化（纯函数，无 I/O）：

```ts
export type ClockMarket = 'A' | 'HK' | 'US'; // G3 扩展点: 'JP' | 'KR' | 'TW' 只加表行

interface MarketSessionSpec {
  tz: string;                                        // IANA 时区，经 Intl 判定（美股 DST 自动正确）
  sessions: Array<{ open: number; close: number }>;  // 当地分钟数；1 段=无午休，2 段=有午休
}

const MARKET_SESSIONS: Record<ClockMarket, MarketSessionSpec> = {
  A:  { tz: 'Asia/Shanghai',    sessions: [{ open: 570, close: 690 }, { open: 780, close: 900 }] }, // 09:30–11:30, 13:00–15:00
  HK: { tz: 'Asia/Hong_Kong',   sessions: [{ open: 570, close: 720 }, { open: 780, close: 960 }] }, // 09:30–12:00, 13:00–16:00
  US: { tz: 'America/New_York', sessions: [{ open: 570, close: 960 }] },                            // 09:30–16:00 单段
};

export function marketPhase(market: ClockMarket, now: Date): MarketPhaseV2;
```

- `MarketPhaseV2 = { phase, phaseKey, minutes? }`，**无 label**——phaseKey+minutes 是唯一正典，UI 经 `t('phase.'+phaseKey, {minutes})` 渲染。
- phaseKey：双段市场沿用 `pre|openMorning|lunch|openAfternoon|closed|weekend`；单段市场（US）用 `pre|open|closed|weekend`（today.json 新增 `phase.open` 键 zh/en）。
- 周末判定按**市场当地**星期（北京周六清晨 = 纽约周五晚，US 必须判 open/closed 而非 weekend——核心跨日陷阱）。
- `aShareMarketPhase(now)` 保留为 `marketPhase('A', now)` 薄包装 + 原 zh label 拼装（既有 8 个测试与任何遗留调用零改动）。
- 新增 `marketOfTicker(ticker): ClockMarket`：`/\.(SH|SZ|BJ)$/i` → A；`/\.HK$/i` → HK；其余 → US（与 eastmoney 解析一致）。
- 节假日历仍不做（既有 tracked debt，现在 ×3 市场）。

### /today 时钟条

- 市场集 = `marketOfTicker` 扫持仓+股票池全 tickers 去重，**按 A → HK → US 排序**；空集回落 `['A']`。
- 每市场一行：市场名（`today.clock.market.{A,HK,US}` i18n 键）+ 状态点（open=绿 / lunch=黄 / 其余灰，用现有语义色 token）+ `t('phase.'+phaseKey)`。现有 60s tick 循环改为对市场集逐个求值。

## G2b 显示时区（浏览器自动 + 可覆盖）

- `src/lib/i18n/locale.ts`：`formatDateLocale(iso, locale, tz?)` / `formatDateTimeLocale(iso, locale, tz?)` 增可选 IANA tz 参数（`undefined` = 浏览器时区，现行为不变）。
- 新 `TimezoneProvider`（挂 `(app)` layout）+ `useDisplayTimezone(): string | undefined`：登录后从 `user_preferences.timezone` 读一次（空串/null = auto → 返回 undefined），server-first、context 缓存。
- 设置页新「🕐 时区」卡：下拉 `自动（跟随浏览器）` + 固定清单 `Asia/Shanghai, Asia/Hong_Kong, Asia/Taipei, Asia/Tokyo, Asia/Seoul, America/New_York, America/Los_Angeles, Europe/London, UTC`；选择即 upsert `user_preferences.timezone`（自动 = 空串），交互模式照抄语言卡（即时保存）。新 UI 全部走 settings.json i18n 键。
- 消费点接线：雷达页生成时间（替换硬编码 `toLocaleTimeString('zh-CN')`）、持仓/成交/决策日期（`formatDateLocale` 调用点传 tz）。

## G2c Cron 锚定与欺骗性 UI

- vercel.json 两条 cron **不动**（全局北京锚定，逐用户时区分发等有真实海外付费用户再做）。
- 设置页「简报时间」`<input type="time">` **移除**（写入 localStorage 后无消费者的假配置），替换为只读说明：`每日 08:30 北京时间（UTC+8）投递` + 用户本地等价时间（有覆盖/浏览器时区可算），i18n 键。`user_preferences.daily_brief_time` 字段保留不动（将来逐用户分发时接线）。
- `dayWindowUtc8` 配额日界维持全局 UTC+8，补注释说明这是产品决策（全体用户统一北京午夜重置）。

## 测试（TDD）

- `marketPhase`：US 夏令时（7 月 EDT）与冬令时（1 月 EST）的开盘/收盘判定各一组；北京周六 09:00 = 纽约周五 21:00 → US `closed` 非 `weekend`；北京周一 08:00 = 纽约周日 → US `weekend`；HK 午休段；A 全相位回归（复用既有 8 测试，断言不变）。
- `marketOfTicker`：`600519.SH→A`、`0700.HK→HK`、`AAPL→US`、`300750.SZ→A`、`830799.BJ→A`。
- `formatDateTimeLocale` tz 参数：同一 ISO 在 `Asia/Shanghai` vs `America/New_York` 输出不同。
- e2e：/today 时钟条渲染（至少 A 股行可见）；既有 10+1 不回归。

## 不做（YAGNI）

- 逐用户时区 cron 分发；三市场节假日历；JP/KR/TW 时钟（G3 只加 `MARKET_SESSIONS` 表行）；`daily_brief_time` 接线；G1d 残留页面抽离（另立批次）。
