# P5a 工具板块 + 一级市场工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.
> **依赖：P4a + P4b 已合并**（artifacts API、AGENT_METHODS、/intel 上线、TabBar 已是 7 条目）。

**Goal:** 🧰 工具板块成型：/tools 门户（技能库/回测/DCF 工作台/一级市场 四入口）+ 一级市场工作台（ic-memo / pe-portfolio 大纲生成器 + LP 追踪模板，产出全部进 artifacts）+ TabBar 收敛为 6+设置。

**Scope decisions:**
- 一级市场 v1 = **确定性大纲生成 → 存档**（骨架含每节检索问题清单）。copilot 无 web-search 工具，联网自动填充不在本期（诚实边界，UI 注明「研究骨架——配合外部检索使用」）。
- /skills 与 /backtest 页面保留原路径（P6 统一决定去留），/tools 是门户+新功能页；TabBar 技能/回测两条目合并为 🧰 工具。

**Verified facts:** ic-memo-outline.mjs（99 行零依赖，输入 --target/--deal-context，输出 {report:{title,subtitle,notices}, sections:[{idx,title,brief,queries[]}]}，8 节框架）；pe-portfolio-outline.mjs（50 行，--fund，3 单元）；investor-lp-tracking 无脚本纯模板（5 类动向/按名分节/日期+来源必填）；DcfStudio 只需 `{ticker}` prop 可独立渲染；TabBar 现 8 条目（P4b 后 7）。

---

## File Structure

- Create: `src/lib/skills/primary/ic-memo.ts` + `ic-memo.test.ts` — 移植 ic-memo-outline（纯函数 TDD）
- Create: `src/lib/skills/primary/pe-portfolio.ts` + `pe-portfolio.test.ts` — 移植 pe-portfolio-outline
- Create: `src/lib/skills/primary/lp-tracking.ts` + `lp-tracking.test.ts` — LP 追踪模板生成（names[] + window → markdown 骨架）
- Create: `src/components/tools/OutlineWizard.tsx` — 通用表单→大纲→预览→存档组件
- Create: `src/app/(app)/tools/page.tsx` — 门户（四卡：技能库→/skills、回测实验室→/backtest、DCF 工作台→/tools/dcf、一级市场→/tools/primary）
- Create: `src/app/(app)/tools/dcf/page.tsx` — ticker 搜索/输入 + `<DcfStudio ticker>`
- Create: `src/app/(app)/tools/primary/page.tsx` — 三个 OutlineWizard（IC Memo / PE Portfolio / LP 追踪）+ 本板块档案列表（GET /api/artifacts?skill_id=ic-memo 等合并展示）
- Modify: `src/components/TabBar.tsx` — 移除 skills/backtest 条目，插入 `{id:'tools', emoji:'🧰', label:'工具', href:'/tools'}`（工具箱线稿 Icon）

---

### Task 1: 三个纯大纲函数 (TDD)

从 osborn-studio-skill-hub 对应 .mjs **移植语义**（读原脚本 /Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/osborn-studio-skill-hub/skills/research/{ic-memo,pe-portfolio}/scripts/*.mjs 后用 TS 重写，不 import 跨仓库）：
```ts
export interface OutlineSection { idx: number; title: string; brief: string; queries: string[] }
export interface Outline { title: string; subtitle: string; notices: string[]; sections: OutlineSection[] }
export function icMemoOutline(target: string, dealContext?: string): Outline           // 8 节
export function pePortfolioOutline(fund: string): Outline                              // 3 节
export function lpTrackingOutline(names: string[], windowLabel?: string /*默认'近一个月'*/): Outline  // 每名 1 节×5 类动向，names 上限 20
export function outlineToMarkdown(o: Outline): string  // 共用渲染：# title / > subtitle / notices / ## idx. title + brief + 检索问题列表 + 待填占位
```
测试 ≥9：ic-memo 8 节且 dealContext 影响第 2 节 queries；pe 3 节；lp names 数=节数、>20 截断、window 出现在 subtitle；outlineToMarkdown 含全部节标题；空 target/fund/names → throw 或返回错误（选 throw Error('target required') 风格，测试锁定）。
Commit: `feat(primary): ic-memo / pe-portfolio / lp-tracking outline generators`

### Task 2: OutlineWizard + /tools 三页

- OutlineWizard props `{ icon, title, desc, fields: Array<{key,label,placeholder,required?,textarea?}>, generate:(values)=>Outline, skillId }`：填表 → 生成 → 预览（pre-wrap markdown）→「存入档案」按钮 POST /api/artifacts `{skill_id, title: outline.title, content_md: outlineToMarkdown(outline), params: values}` → 成功显示链接提示。
- /tools 门户页：四张卡（Panel+启动链接），下方「最近工具产出」（GET /api/artifacts?limit=8）。
- /tools/dcf：搜索框（/api/search 下拉，同 intel 研究 tab 的模式）或直接输入 ticker → 渲染 `<DcfStudio ticker={t}/>`；空态提示。
- /tools/primary：三个 OutlineWizard 手风琴/纵排 + 该板块档案列表（skill_id in [ic-memo, pe-portfolio, lp-tracking]——API 单 skill_id 过滤则并发三次取并合并按时间排）。
Gates: tsc + build（ƒ /tools, /tools/dcf, /tools/primary）+ test。Commit: `feat(tools): tools portal, standalone DCF workbench, primary-market workbench`

### Task 3: TabBar 收敛

移除 skills/backtest 条目；watch/portfolio/intel 之后插入 🧰 工具（扳手+箱体线稿 Icon）。终态 7 条目：今日/股票池/情报/我的投资/工具/设置——equals 6+设置（若 P4b 已并成此形则只做 skills/backtest→tools 替换）。检查无测试断言 Tab 数量。
Gates: tsc + build + test。Commit: `feat(tools): consolidate skills+backtest tabs into tools`

### Task 4: 终审 + 合并

重点：OutlineWizard 存档链路、DcfStudio 独立页数据加载、Tab 变更无死链（/skills /backtest 仍可从 /tools 门户到达）。
