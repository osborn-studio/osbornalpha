# OsbornAlpha 产品演示视频

| 文件 | 说明 |
|---|---|
| [`2026-10-19-product-demo.mp4`](2026-10-19-product-demo.mp4) | 成片：1600×900、30 fps、H.264 + AAC，中文旁白（macOS `say -v Tingting`）+ 烧录中文字幕 + 右上角章节标 |
| [`2026-10-19-product-demo-script.md`](2026-10-19-product-demo-script.md) | 分镜脚本：每个镜头的画面、旁白、时长、亮点 |
| [`record/`](record/) | 复现录制所需的全部脚本 |
| `build/` | 中间产物（原始 webm、旁白 wav、字幕 PNG、分镜 mp4），被仓库根 `.gitignore` 的 `build/` 规则忽略，不入库 |

成片时长与体积见文末「产出记录」。

## 录制方式

采用任务建议的方式 (a)：**本地 dev server + 本地 Supabase + 造出来的干净演示数据**。画面里没有任何真实持仓、真实账号或现网数据，可以公开。没有使用现网 osbornalpha.com，也没有使用 Claude in Chrome。录制中创建的 playbook run、建议与决定都只存在于本地 Supabase，因此不需要对现网做撤回 / 取消 / 关闭。

- 录屏：Playwright `recordVideo`（无头 Chromium，1600×900，`zh-CN`，`Asia/Shanghai`）。每个镜头一个独立 browser context，产出一个 webm。
- 画面里的鼠标是注入页面的合成光标，点击时有一圈橙色扩散，方便看清操作位置（Playwright 视频本身不画光标）。Next.js 开发模式左下角的 dev 徽标在录制时用一条 CSS 隐藏，不属于产品 UI。
- 旁白：`say -v Tingting -r 185` 逐句生成，测出每句时长后排时间轴；录制时每个镜头至少停留到旁白念完。
- 合成：Pillow 渲染字幕、章节标、片头卡、三层边界图和片尾卡为透明 PNG，ffmpeg `overlay` 按时间轴叠加。本机 ffmpeg 没有 libass / drawtext，所以不用 srt 烧录。镜头画面比旁白长时，音频补静音，不截断操作。最后 concat 成片。

## 环境

| 组件 | 版本 / 说明 |
|---|---|
| Node | 22.x（仓库 `engines`）；本次录制机器实际为 26.5，`npx tsx` 正常 |
| Next.js dev server | 通过 `.claude/launch.json` 的 `stock-monitor` 配置启动（`npm run dev`，端口 3000），不要用裸 Bash |
| Supabase CLI | 2.78.1，`supabase start` 本地栈（只需 db / auth / rest / kong） |
| Docker Desktop | 运行中 |
| Playwright | 1.61.1（仓库 devDependency，Chromium 已缓存） |
| ffmpeg / ffprobe | 8.1（需 libx264 + aac） |
| Python | 3 + Pillow；字体 `/System/Library/Fonts/Hiragino Sans GB.ttc` |
| macOS `say` | 中文语音 Tingting |

## 复现步骤

全部命令在仓库根目录执行。

1. 起本地 Supabase。分析服务的 vector 容器在本机会段错误，所以排除用不到的服务：

```bash
supabase start -x vector,logflare,studio,imgproxy,edge-runtime,realtime,storage-api,mailpit,postgres-meta,supavisor
```

   `supabase/config.toml` 固定 Postgres 15，而迁移 `20261018120000_anchor_runner.sql` 用了 Postgres 16 才有的 `grant … with set true`，在 15 上会失败（见「录制时发现的问题」第 2 条）。本次录制的做法是：启动前把这一个文件临时移出 `supabase/migrations/`，启动完再移回。它只建 S4 anchor runner 的函数和角色，与演示无关。

2. 写 `.env.development.local`（已被 `.gitignore` 忽略），把 dev server 指向本地栈。值来自 `supabase status -o env`：

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase status 的 ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<supabase status 的 SERVICE_ROLE_KEY>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=
```

3. 通过 preview 配置启动 dev server（Claude Code 里用 `preview_start {name: "stock-monitor"}`，或在终端里 `npm run dev`）。

4. 造演示数据。脚本只接受 `127.0.0.1` / `localhost` 的 Supabase URL，每次运行先清空演示账号自己的行再重建，可反复执行：

```bash
npx tsx docs/demo/record/seed-demo.ts
```

5. 预先评分（原因见「录制时发现的问题」第 1 条）：

```bash
npx tsx docs/demo/record/score-offline.ts
```

6. 生成旁白和时间轴，再录制，再合成：

```bash
python3 docs/demo/record/build.py --timing-only
```

```bash
npx tsx docs/demo/record/record.ts
```

```bash
python3 docs/demo/record/build.py
```

   `record.ts` 可以只录部分镜头，例如 `npx tsx docs/demo/record/record.ts s08 s09`。镜头 8、9 会真的创建并批准一个 playbook run、登记一条建议，所以重录它们之前先重跑第 4、5 步。`record.ts` 在录镜头 10 之前会自动调用一次 `score-offline.ts`，给镜头 9 新登记的建议打分。某个镜头失败时，脚本会留下 `build/<镜头>-failed.png` 截图和 `build/raw/<镜头>.failed.webm`。

## 演示数据

全部由 `record/seed-demo.ts` 造出，均为虚构，不对应任何真实账户。

| 数据 | 内容 |
|---|---|
| 账号 | 本地测试账号 `demo@osbornalpha.local`，`profiles.role = admin`（Research OS 需要）。凭据见 `record/demo-account.ts`，只在本地 Supabase 里存在 |
| 股票池 | 长期持有：茅台 / 腾讯 / 英伟达；机会跟踪：阿里巴巴 / 苹果 / 美的；仅观察：特斯拉 / 小米 |
| 实盘（虚构） | 6 笔成交（茅台两次买入、腾讯、英伟达、苹果买入后卖出），由成交推出 4 个持仓；4 条历史决定 |
| 分析师 | 「我」（真人，`is_self`）与「John Cameron」（Agent），共 9 条历史建议，日期分布在过去 12–74 天 |
| Research OS | 仓库自带的研究种子（AI 公司、主题、6 条 axiom）+ 「贵州茅台」实体及核验证券 600519.SH + 「NVIDIA」证券 + 3 份来源文档 + 2 条论点（茅台 ACTIVE，英伟达 WATCH） |
| 录制中产生 | 镜头 8：一条 PAPER_TRADE run（发起并批准）；镜头 9：登记一条建议到自动创建的「Research Playbook」Agent；镜头 11：一条采纳该建议的买入决定 |

## 镜头与源素材

| 镜头 | 路由 | 录制函数（`record/record.ts`） | 原始素材 | 依赖数据 |
|---|---|---|---|---|
| 01 开场 | `/today` | `s01_intro` | `build/raw/s01_intro.webm` + 片头卡 | 股票池、持仓 |
| 02 Today 看盘 | `/today` | `s02_today` | `build/raw/s02_today.webm` | 同上 |
| 03 行情与 K 线 | `/stock/600519.SH` | `s03_stock` | `build/raw/s03_stock.webm` | 实时行情（新浪 / 腾讯） |
| 04 股票池 | `/watchlist` | `s04_watchlist` | `build/raw/s04_watchlist.webm` | 股票池；证券主数据含比亚迪 |
| 05 Intel | `/intel` | `s05_intel` | `build/raw/s05_intel.webm` | 无 |
| 06 三层边界 | `/research` | `s06_boundary` | `build/raw/s06_boundary.webm` + 三层边界图叠加 | 研究种子 |
| 07 公司与论点 | `/research/companies`（列表）、`/research/theses/[id]` | `s07_research` | `build/raw/s07_research.webm` | 茅台实体与论点 |
| 08 Playbook 审批 | `/research/playbooks` | `s08_playbook` | `build/raw/s08_playbook.webm` | 茅台论点、axioms |
| 09 登记为建议 | `/research/playbooks` | `s09_register` | `build/raw/s09_register.webm` | 镜头 8 批准的 run |
| 10 Analyst | `/analyst`、`/analyst/[id]` | `s10_analyst` | `build/raw/s10_analyst.webm` | 9 条历史建议 + 镜头 9 的建议（离线评分） |
| 11 Portfolio | `/portfolio`、`/portfolio/decisions`、`/portfolio/review` | `s11_portfolio` | `build/raw/s11_portfolio.webm` | 持仓、决定、复盘评分；镜头 9 的建议 |
| 12 Copilot | `/stock/600519.SH` + ⌘K | `s12_copilot` | `build/raw/s12_copilot.webm` | 无（不发起 LLM 调用） |
| 13 设置 | `/settings` + 🎨 | `s13_settings` | `build/raw/s13_settings.webm` | 无 |
| 14 结尾 | 静态结尾卡 | `build.py` 的 `outro_png` | `build/subs/outro.png` | 无 |

旁白与字幕文本的唯一来源是 `record/narration.json`，分镜脚本里的旁白与它一致。

## 录制时发现的问题

没有改任何产品代码，以下只做记录。

1. **分析师评分与决定复盘只从东方财富取 K 线，没有回退。** `src/lib/analyst/score-store.ts` 和 `src/lib/portfolio/review-store.ts` 都直接调用 `fetchEastmoneyKline`（push2his.eastmoney.com）。录制当天（2026-10-18）本机连不上该域名：TLS 握手成功后连接被断开，curl 返回 000。push2delay 返回 502。与此同时，个股页 K 线经 `resolveKline` 回退到腾讯 / 新浪，一切正常。结果是 `/analyst` 的「刷新评分」会把所有建议计为跳过，`/portfolio/review` 也打不出分。演示里的评分由 `record/score-offline.ts` 写入。它调用产品自己的 `needsScoring`、`buildScoreWrites`、`buildReviewDrafts`，K 线取自本地 `/api/kline`（腾讯 / 新浪，A 股前复权、港美股不复权，与东方财富默认一致）。所以镜头 10 只把鼠标指向「刷新评分」，不点它。建议让两个评分任务也走 `resolveKline` 的回退链。
2. **Research OS 公司详情页 `/research/companies/[id]` 一律返回 500。** `GET /api/research/entities/[id]` 调用 `listSourcesForEntity`（`src/lib/research/sources.ts`），它用 `.contains('entity_ids', [entityId])` 过滤，而 `research_source_documents.entity_ids` 是 `jsonb` 列。supabase-js 把 JS 数组编码成 Postgres 数组字面量 `cs.{…}`，Postgres 报 `invalid input syntax for type json`，页面显示「加载失败：500」。同一个路由里 `src/lib/research/memos.ts` 的 `listMemosForEntity` 用的是 `.or('company_ids.cs.["…"]')` 的 JSON 写法，所以没事。这条查询不依赖本地环境，现网很可能同样失败。修复思路是改成 `.contains('entity_ids', JSON.stringify([entityId]))` 或 `.filter('entity_ids', 'cs', JSON.stringify([entityId]))`。镜头 7 因此只停在公司列表卡片上，不点进详情页。
3. **`20261018120000_anchor_runner.sql` 在本地 Postgres 15 上无法应用。** `grant … with set true, inherit false` 是 Postgres 16 的语法；`supabase/config.toml` 的 `[db] major_version = 15`，所以全新的 `supabase start` 会在这条迁移上失败。线上与 CI 演练用的是 17，不受影响。建议把本地 `major_version` 升到 17，或给这段加版本判断。
4. **本地 `supabase start` 的 vector（日志分析）容器在本机段错误退出。** 健康检查因此失败，整个栈被停掉。用 `-x vector,logflare,…` 排除后正常。与仓库无关，是本机 Docker 镜像问题。
5. **登录按钮在页面水合完成前是 disabled 的。** 自动化在 `domcontentloaded` 后立即填表时，React 尚未接管受控输入，按钮一直是 disabled。这对真人不构成问题，录制脚本等到 `networkidle` 后再填表。
6. **Today 雷达在休市时会把全部标的收进「⚪ 平静 N 只（展开）」。** 周末录制时首页中栏只剩一行折叠按钮，录制脚本会先点开它。这是设计行为，记在这里方便以后录制的人知道。
7. **Copilot 只在个股页自动带入标的。** `CopilotFab` 的 `tickerFromPathname` 只识别 `/stock/<代码>`。在 `/portfolio?s=600519.SH` 这样以查询参数表示焦点标的的页面按 ⌘K，代码框是空的。镜头 12 因此改在个股页演示。是否在驾驶舱也带入焦点标的，留给产品决定。
8. **固定底栏会挡住页面底部的按钮。** 底部 TabBar 是 `fixed`，滚动到页面底边的按钮（例如 Playbooks「② 待审批」里的「✅ 批准」）会落在它下面。自动化点击因此打到了「今日」并跳走。真人通常会再滚一下，影响不大；录制脚本会先把目标滚到视口中部再点。

## 产出记录

录制与合成于 2026-10-18（周日，A 股 / 港股休市，美股周末），数据为当日收盘后的公开行情。

| 项 | 值 |
|---|---|
| 成片 | `docs/demo/2026-10-19-product-demo.mp4` |
| 时长 | 6 分 04 秒（363.6 s），14 个镜头 |
| 体积 | 18.1 MB（低于 100 MB，未另出 720p 版） |
| 视频 | H.264 High，1600×900，30 fps |
| 音频 | AAC-LC，48 kHz 单声道，旁白 + 烧录字幕 |
| 校验 | `ffmpeg -v error -i … -f null -` 全片解码无报错；音视频时长差 < 0.03 s |

每个镜头的画面长度取「录屏长度」与「旁白长度」中较长者，旁白从镜头开头 0.8 s 起按句排布，字幕与对应句子的音频同起同止。
