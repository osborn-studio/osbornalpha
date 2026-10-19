# 接入跨应用 LLM 注册表（L0）并重做 LLM 设置板块

日期：2026-10-18。分支 `claude/intelligent-wing-a53063`，基于 `main` `76b0304`。状态：设计中。审计：Codex gpt-6.1-sol r1 → 6 P1（目录模型≠适配器可用模型；无新 key 保存的后端契约缺失；切供应商不清空明文 key；MiniMax 存量兼容无证据；写规范 id 破坏回滚；discovery 鉴权头与 `anthropic-version` 未定）+ 9 P2（默认模型策略影响 env 用户；fail-closed 描述与代码不符；readiness 未绑定密钥版本；UI 竞态；HTTP 成功≠协议成功；discovery 不完整/不支持未区分；入口鉴权/限流/校验；聊天适配器未禁重定向；验收覆盖不到消费链与 UI），全部并入 §2/§3/§6/§7。r2 → 2 P1（probe 与真实调用脱节；MiniMax 按模型名保旧路径护不住全部存量行）+ 7 P2（无 key 保存的并发写回；`ready` 未绑定服务端配置版本；协议校验过宽；probe 无响应体上限；settings POST 入口边界；新供应商行的回滚；reducer 测试证明不了组件提交）+ 1 P3（文档自相矛盾），并入 §2/§3/§6/§7/§9。r3 → 1 P1（MiniMax env 自动回退漏旧路径）+ 2 P2（无 key 保存不切路径；保存期间编辑与重复提交未定义）+ 2 P3（§9 残留旧说法；`response_model` 无链路），并入 §2/§3/§8/§9。r4 → r3 全部关闭；新增 1 P1（中途 typecheck 未过，实施完成前消除）+ 3 P2（`resolveProviderId` 接受原型属性 → `Object.hasOwn`；自定义/存量模型要有行可测；probe 的 `storedProviderId` 来源要在路由契约写明）+ 1 P3（保存响应带 `legacyPath`），并入 §3。来源：PA 仓工作包 `Osborn-PA/docs/handoffs/2026-10-18-alpha-llm-registry-work-package.md`（以它为准），L0 规格 `Osborn-PA/docs/superpowers/specs/2026-10-18-llm-registry-l0-design.md`，包 `Osborn-PA/packages/llm-registry/`（分支 `codex/llm-provider-learnings`，head `af7dfe66`，包最后一次改动 `ad876bf3`，PR 未开）。

## 1. 现状（已核对）

| 项 | 现状 |
|---|---|
| `src/lib/llm/providers.ts` | 手敲 5 家：`ark`（ARK coding plan，Anthropic 协议，`/api/coding` + `/v1/messages`）、`deepseek`、`openai`、`kimi`（moonshot.cn）、`minimax`（`/text/chatcompletion_v2` 旧路径，默认 `MiniMax-Text-01`） |
| 密钥 | BYOK：每用户一行 `llm_settings(user_id, provider, model, api_key_cipher)`；env 回退 `ARK_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY / KIMI_API_KEY / MINIMAX_API_KEY`，`LLM_PROVIDER` 可钉死 |
| 解析 | `resolve.ts`：用户行 → env；`AUTO_PROVIDER_PREFERENCE = [deepseek, ark, openai, kimi, minimax]`；`ResolvedLlm.provider` 进用量记录与 `PRICE_REGISTRY`（只有 `deepseek:deepseek-v4-flash`） |
| 适配器 | `openai-compat.ts`（`Authorization: Bearer`）、`anthropic-compat.ts`（也是 `Authorization: Bearer`，ARK 接受）；失败抛 `Error('llm <status>: <上游原文>')` |
| 设置页 | `LlmSettings.tsx`：下拉选供应商 → 填 key → 手敲模型名 → 测试（1 token 真实调用）→ 保存；测试失败把 `e.message`（含上游原文）直接渲染 |
| 消费方 | `copilot/route.ts`（按 `protocol` 选适配器，`provider === 'deepseek'` 关 thinking）、`data/sources/llm.ts` 的 `chatResolved`、`brief/*`、`perspectives/*`（只用 `provider` 字符串记录来源） |

注册表侧事实：`deriveProviders('alpha')` 给 14 家（协议映射 `openai-chat-completions → 'openai'`、`anthropic-messages → 'anthropic'`；排除 `ollama`）；Alpha 别名只有 `openai / deepseek / kimi_cn→kimi / minimax_cn→minimax / doubao→ark`；`models.json` 里 **`doubao` 没有任何模型**（models.dev 无来源）；`gemini` 的 `auth` 是 `x-goog-api-key`，但它给 Alpha 的端点是 OpenAI 兼容路径（该路径需要 `Authorization: Bearer`）。

## 2. 决定

| 问题 | 决定 |
|---|---|
| 注册表怎么进仓 | 工作包 §5：PA PR 合并前**复制 JSON 快照**到 `src/lib/llm/registry/`（`providers.json`、`models.json`、`SOURCE.md` 记来源仓/分支/commit）。`derive.js` 未发包，Alpha 用一个 **TS 移植** `registry/derive.ts`，并用 PA `derive.js` 对 `'alpha'` 的实际输出冻结为 `registry/fixtures/alpha-derived.json`，测试逐项相等（对拍）。PA 发包后改为依赖包并删掉移植。 |
| 供应商 id | 运行时**规范 id = 注册表 id**（`doubao / kimi_cn / minimax_cn / ...`）。存量 `llm_settings.provider` 的 `ark / kimi / minimax` 经 `aliases.alpha` 反查，**不迁移数据**。**存储 id**（r1 P1-5）：`ark / deepseek / openai / kimi` 继续写旧 id（回滚到旧版代码仍可读）；`minimax_cn` 写注册表 id（见下一行，存储 id 同时编码请求路径代际）；其余新供应商写注册表 id。`LLM_PROVIDER` env 也接受旧 id。 |
| 目录范围 | 全部 `deriveProviders('alpha')` 的 14 家都进设置页（目录来自注册表，不再 Alpha 自选）。env 回退只认原 5 家（规范 id），顺序不变。 |
| ARK coding plan | Alpha 侧显式覆盖：`doubao` 用 `anthropic-messages` 端点（`https://ark.cn-beijing.volces.com/api/coding` + `/v1/messages`，discovery `/v1/models`）。不要求注册表加 `preferred_endpoint`。 |
| 鉴权头 | 来自注册表的端点级 auth（`authFor`，2026-10-19 快照起；之前是"openai 一律 Bearer"的 Alpha 规则，结果相同）：OpenAI 兼容端点都是 `Authorization: Bearer`，Claude = `x-api-key`。`LlmConfig` 增可选 `authHeader / authPrefix`，缺省 Bearer，老调用方不变。 |
| 默认模型（r1 P2-7：两个概念分开） | **平台默认** `platformDefaultModel`：只给 env 回退（`LLM_MODEL` 未设时）用，5 家逐字保持今天的值（`doubao-seed-code / deepseek-v4-flash / gpt-4o / moonshot-v1-32k / MiniMax-Text-01`），其余供应商无平台默认（env 回退本来也只认这 5 家）。**目录推荐** `suggestedModel`：设置页预选用，钉死 `deepseek → deepseek-v4-flash`、`doubao → doubao-seed-code`（注册表无数据）；其余 = `models.json` 中该供应商聊天模型里 `release_date` 最新者（同日按 id 升序取首个；无 `release_date` 排最后）；无模型则 `null`，页面要求先选。推荐只是预选，保存前用户看得见、改得了。 |
| 模型持久化 | `llm_settings` 结构不动，所以**只能保存一个模型**：列表是单选（radio），勾中的即保存的 `model`；允许自定义模型名（正则 `^[A-Za-z0-9._:/-]{1,100}$`，与 PA `models-list.js` 一致）。"每个模型行的真实调用测试"按行提供。 |
| 目录模型 ≠ 可用模型（r1 P1-1） | 不做静态兼容规则（注册表没有端点/参数兼容字段，`gpt-5-pro` 只走 Responses、`o3` 不收 `max_tokens` 这类差异无法从数据判断）。目录里的模型一律标"未验证"，**唯一的可用证据是模型行的真实调用测试**（走 Alpha 实际的适配器路径与请求形状），测试通过才 `ready`；测试失败按 class 给动作（`bad_request` → 换一个模型）。这是 Vox "资格是证据不是凭据存在"原则的直接应用。 |
| MiniMax 存量路径（r1 P1-4、r2 P1-2） | 没有 key 验证不了任何存量模型在 `/v1/chat/completions` 上的行为，所以**按存储 id 区分代际**：`llm_settings.provider = 'minimax'`（旧版写的，或 `LLM_PROVIDER=minimax`）→ 不论模型名，`chat_path = /text/chatcompletion_v2`（今天的路径，逐字不变）；`provider = 'minimax_cn'`（本版设置页保存的）→ 注册表的 `/v1/chat/completions`。`chatPathFor(def, storedProviderId)` 是唯一的判定点。env 回退（r3 P1）：显式 `LLM_PROVIDER=minimax` 与**自动回退**（只配了 `MINIMAX_API_KEY`）都按旧 id `minimax` 判定 → 旧路径，即 env 侧的存储 id = `legacyId ?? id`；只有显式 `LLM_PROVIDER=minimax_cn` 走新路径。设置页对旧行显示"使用旧接口路径，保存后切换到新路径"。owner 验证后可删掉这条规则并把旧行改名。 |
| 状态词汇 | Vox 三轴的 readiness：`unconfigured`（无行）→ `configured_unverified`（已保存，本次会话无通过的真实调用证据）→ `ready`（**含义严格限定为"普通对话调用通过"**，r2 P1-1：不宣称工具调用 / JSON 模式可用，页面文案照此写；Copilot 的工具调用由它自己的运行证明）。**证据绑定服务端配置版本**（r1 P2-9、r2 P2-4）：`GET /api/llm/settings` 与保存响应都带不透明 `version`（= 行的 `updated_at`）；用已保存 key 的 `test` 响应带它实际读到的 `version`；前端只在"响应的 provider/model/version 都等于当前已保存配置"时置 `ready`，否则显示"配置已在别处修改，请刷新"。输入框里出现新 key、保存、切供应商、改模型任一动作都回到 `configured_unverified`。前端把**编辑草稿**与**已保存配置**分开保存；保存使所有在途测试失效（版本变了）。用输入框 key 测试通过只证明"这把 key 可用"，显示在结果行，不置 `ready`。不持久化证据（不改表）。 |
| 错误文案 | 响应只带 `{ class, status? }`，前端按 class 给动作。不再渲染上游 `e.message`。 |
| 价格 | 只展示 `models.json` 参考价（`referencePrice()` 移植：`price_cny_micro` > `cost_usd × usd_cny`），标"参考价"。PA 只读端点上线后再做拉取 + 快照兜底（本次不做）。Alpha 自己的计费/配额（`PRICE_REGISTRY`、预算准入）不变。 |
| 不动 | `resolveLlm()` / `resolveUserLlm()` / `resolvePlatformLlm()` 的解析顺序；BYOK 不计平台配额；`llm_settings` 表；`copilot` 等调用链。r1 P2-8 指出的现状（`getUserLlm()` 把数据库错误当无行、`resolveUserLlm()` 把解密失败当无 key，随后回落平台 key）**是既有行为，本次不改**，记为后续工作；本次新增的路由自己不回落：无行 / 读取失败 / 解密失败分别是 `key_required` / `store_unavailable` / `key_unreadable`，绝不用 env key 做用户的测试。 |

## 3. 范围

做：

1. `src/lib/llm/registry/`：`providers.json`、`models.json`（原样复制）、`SOURCE.md`、`derive.ts`（`deriveProviders / endpointFor / resolveUrl / referencePrice / NON_CHAT`）、`fixtures/alpha-derived.json`。
2. `providers.ts` 改为派生：`ProviderDef { id, legacyId: string|null, storageId, label, baseUrl, chatPath, discoveryPath, protocol, authHeader, authPrefix, platformDefaultModel: string|null, suggestedModel: string|null, keyUrl: string|null, docsUrl: string|null, region }`；`getProvider(idOrAlias)`；`PROVIDER_IDS` 为派生顺序（注册表顺序）；`resolveProviderId(idOrAlias): string|null`；`chatPathFor(def, storedProviderId)`（MiniMax 代际规则）；`llmConfigFor(def, { model, apiKey, storedProviderId })` 是 resolve 与 probe **共用**的 `LlmConfig` 构造（r2 P1-1）。
3. `resolve.ts`：`ENV_KEY` 改为规范 id 键（变量名不变）；`LLM_PROVIDER` 经 `resolveProviderId`；`ResolvedLlm` 增 `authHeader / authPrefix`；`cfg` 经 `llmConfigFor`（含 `chatPathFor`）；`model` 回退 `platformDefaultModel`；`provider` 字段为规范 id（用量记录里 `ark→doubao`、`kimi→kimi_cn`、`minimax→minimax_cn`，写进变更说明）。
4. `anthropic-compat.ts` / `openai-compat.ts`：`LlmConfig` 增可选 `authHeader / authPrefix / maxResponseBytes`；`openai-compat` 忽略 auth 覆盖（固定 Bearer）；`anthropic-compat` 使用。两个适配器的 `fetch` 加 `redirect: 'error'`（r1 P2-14）。**响应体有界读取**（r2 P2-6）：共用 `readJsonBounded(res, limit)`，默认 8 MB，错误响应原文最多读 64 KB；超限抛错。**协议形状校验收紧到消费方实际读取的字段**（r1 P2-11、r2 P2-5），放在适配器里让所有消费方受益：`openai` 要求 `choices` 为非空数组、`choices[0].message` 为对象、`content` 为 string/null/缺省、`tool_calls` 若存在为数组且每项有 `id` 与 `function.name/arguments` 字符串；`anthropic` 要求 `type !== 'error'`、`content` 为数组且每个 block 为带字符串 `type` 的对象，`text` block 的 `text` 为字符串，`tool_use` block 的 `id/name` 为字符串。不满足抛 `LlmResponseShapeError`（`classifyLlmError` → `invalid_output`）。两处构造 `cfg` 的地方（`copilot/route.ts`、`data/sources/llm.ts`）透传 auth 字段，并各加一条测试断言透传。
5. 新 `src/lib/llm/errors.ts`：`classifyLlmError(e): { class, status? }`（从 `llm <status>:` 前缀取状态；`AbortError → timeout`；`TypeError → network`；其余 `unknown`）；`httpClass(status)`：401/403 `auth`、402 `quota`、404 `not_found`、429 `rate_limited`、≥500 `server_error`、其他 4xx `bad_request`。
6. 新 `src/lib/llm/discover.ts`：`discoverModels(def, apiKey, fetchImpl?)`：`GET base + discoveryPath`；请求头按协议（r1 P1-6）：`openai` → `Authorization: Bearer <key>`；`anthropic` → `<def.authHeader>: <def.authPrefix><key>` + `anthropic-version: 2023-06-01`；`redirect: 'error'`，8 s 超时，1 MB 上限（流式读，超限即中止并返回 `class: 'invalid_output'`，不解析）。解析 `data[].id`（OpenAI 与 Anthropic 的 `/models` 同形）；id 正则过滤、去重、排序；**不完整要标出来**（r1 P2-12）：`truncated: true` 当原始条数 > 500 或响应带 `has_more: true` / `next_page`；HTTP 404/405 → `class: 'discovery_unsupported'`（文案：该供应商不支持列表接口，可从内置目录选或手输），**不是**密钥错误；401/403 才是 `auth`。返回 `{ ok:true, latency_ms, models, truncated } | { ok:false, class, status? }`。不缓存（key 是用户的）。
6b. 新 `src/lib/llm/probe.ts`：`probeModel(def, { model, apiKey, storedProviderId })`：真实调用测试**走实际消费链**（r2 P1-1）：`llmConfigFor` 构造 cfg（同 resolve），再调用真实适配器 `openai-compat.chat` / `anthropic-compat.anthropicChat`（`messages=[user:'ping']`, `max_tokens: 1`, `timeoutMs: 15000`, `maxResponseBytes: 1 MB`），形状校验由适配器完成。成功 `{ ok:true, latency_ms }`；失败经 `classifyLlmError`。它证明的是"这个 provider+model+key 在 Alpha 的普通对话路径上能返回协议正确的响应"，不多不少。
7. 路由：
   - `GET /api/llm/catalog`：`{ providers: [{ id, legacyId, label, protocol, region, suggestedModel, keyUrl, docsUrl }] }`；`?provider=<id>` 时附 `{ models: [{ id, context, output, reasoning, structured_output, price: {input,output,reference}|null, hint }] }`（只含聊天模型，`NON_CHAT` 过滤；全部是"未验证"目录条目）。无鉴权要求（纯目录，无密钥，不读 cookie）。
   - `POST /api/llm/discover` `{ provider, apiKey? }` 与 `POST /api/llm/test` `{ provider, model, apiKey? }`（r1 P2-13 入口边界）：**要求已登录**（`supabase.auth.getUser()`，否则 401）；请求体 ≤ 8 KB、字段运行时校验（`provider` 字符串 ≤ 64 且 `resolveProviderId` 非空；`model` 过正则；`apiKey` 字符串 1..512 且无控制字符）；每用户进程内限流 30 次 / 分钟（超出 429）。无 `apiKey` 则用已保存的 key，**仅当已保存行的 provider（反查后）等于请求 provider**，否则 400 `key_required`；`test` 的 `storedProviderId`（r4 P2-4）：省略 key 时取实际读到的行的 `provider`（旧 MiniMax 行因此测旧路径）；提供新 key 时取 `def.storageId`（本版保存会写的 id，测新路径）；读取失败 503 `store_unavailable`；解密失败 500 `key_unreadable`。两条路由永不读 env key。成功 `{ ok:true, latency_ms, ... }`；失败 `{ ok:false, class, status? }`。响应不含密钥、请求头、URL、上游原文。
   - 三条 POST 共用入口边界 `readLlmBody(req)`（r2 P2-7）：先鉴权（`getUser()`，否则 401）再解析；请求体 ≤ 8 KB；字段运行时校验如上；数据库读写失败 503 `store_unavailable`（不再伪装成 401）。
   - `POST /api/llm/settings`（r1 P1-2、r2 P2-3）：`{ provider, model, apiKey? }`；接受规范 id 或旧 id，**写存储 id**（§2）；`model` 必填且过正则（不回落默认，因为部分供应商无推荐）。`apiKey` 省略时**原子更新**（r3 P2-2：任何本版保存都写存储 id，所以旧 MiniMax 行在此切到新路径）：`update llm_settings set provider = 存储 id, model, updated_at where user_id = ? and provider in (存储 id, 注册表 id, 旧 id)`，**不重写密文**；影响 0 行 → 400 `key_required`。带 `apiKey` 时 upsert（provider = 存储 id, model, 新密文）。响应 `{ ok, provider, legacyId, storedProvider, model, version, legacyPath: false }`（r4 P3）。`GET` 返回 `{ provider: 规范 id, legacyId, storedProvider, model, configured, version, legacyPath: boolean }`。
8. `LlmSettings.tsx` 重做（三步流，单卡片纵向）：
   - 状态机抽成纯函数 `src/lib/llm/settings-state.ts`（reducer + selectors + **请求构造器** `discoverRequest(state) / probeRequest(state, model) / saveRequest(state)`，vitest 覆盖；组件只渲染并把构造器的输出原样 `fetch`，r2 P2-9），状态分 `saved`（服务端返回的配置：provider / model / version / legacyPath）与 `draft`（provider / key 输入 / 选中模型 / 发现结果 / 测试结果）；事件：`loaded / selectProvider / editKey / discoverStarted / discoverFinished(seq) / selectModel / probeStarted / probeFinished(seq) / saveStarted / saveFinished(seq)`。
   - ① 供应商：按 region 分组的选择（cn / intl / us）；显示当前已保存状态徽标（`configured_unverified` / `ready`）。
   - ② 密钥：显隐切换；"获取 Key" 链接（`keyUrl`）；[测试连接]（无 key 且无已保存同供应商 key 时禁用）；结果行：`✓ 812 ms · 12 个模型（列表不完整）` 或 `✗ <class 文案> · HTTP 401 → <动作>`。
   - ③ 模型：列表 = 发现结果 ∪ `models.json` 目录 ∪ 当前已保存模型 ∪ 用户输入的自定义模型（r4 P2-3：没有元数据也要有行，才有 [测试调用] 可按）；可搜索；默认"只看聊天模型"（`NON_CHAT`）；每行：id、上下文/输出、能力标签（推理 / JSON）、参考价、来源标签（发现 / 内置目录·未验证）；单选；"自定义模型名"输入框；每行 [测试调用]（需要 key：已保存同供应商 key 或输入框里有 key）；测试结果显示在行内（延迟或 class + 动作）。
   - [保存]：需要 provider + model + （输入框 key 或已保存同供应商 key）。保存后 key 输入清空，状态 `configured_unverified`；对已保存 provider+model **用已保存 key** 的 [测试调用] 通过 → `ready`。
   - 切换供应商（r1 P1-3）：**清空明文 key 输入框**、模型选择、发现结果与测试结果；若切回已保存供应商，预选已保存模型。
   - 竞态（r1 P2-10、r2 P2-4、r3 P2-3）：每个请求带递增 `seq` 与发起时的 `{ provider, model, keyGeneration, savedVersion }`；响应到达时与当前状态不一致则丢弃。**保存期间锁定整张卡**：供应商、key 输入、模型选择、自定义模型名、所有测试按钮与保存按钮全部禁用，保存响应到达（成功或失败）才解锁；保存成功后 `saved` 整体替换为响应（provider / model / version / legacyPath），`draft` 的 key 清空，所有在途测试自动失效。
9. i18n：`messages/{zh,en}/components.json` 的 `llmSettings` 扩充：class 文案与动作（`auth` 换 key；`quota` 充值；`not_found` 刷新列表重选；`rate_limited` / `server_error` 稍后再试；`bad_request` 检查模型名或参数；`timeout` / `network` 检查网络后重试；`unknown` 重试）。
10. 测试（vitest，r1 P2-15：验收跑全量 `npm test`；r2 P2-9：组件级交互测试需要 jsdom + testing-library，仓库未引入，本次以请求构造器 + reducer 的纯函数测试代替，组件只做 `fetch(构造器输出)`，并在本地 dev server 走查，记为已知差距）：`registry/derive.test.ts`（对拍 fixture；`resolveUrl`；`referencePrice`）；`providers.test.ts`（14 家；5 家旧 id 反查与 `storageId`；`doubao` 端点逐字；MiniMax 按存储 id 的路径代际（旧 id 任意模型 → 旧路径；新 id → 新路径）；平台默认 5 家逐字；推荐规则；`baseUrl` https）；`resolve.test.ts`（旧 id 行解析为规范 id 且 URL/模型不变；`LLM_PROVIDER=ark`；顺序不变；`authHeader` 透传；env 默认模型逐字不变）；`errors.test.ts`；`discover.test.ts`（mock fetch：成功 / 401 / 404 → unsupported / 非 JSON / 超大 / 超时 / 重定向 / `has_more` 截断 / 头部按协议）；`probe.test.ts`（走真实适配器：URL/头/`chatPathFor`；形状不对 → `invalid_output`；上游 4xx/5xx 分类）；适配器测试加形状校验与有界读取用例；路由测试（`catalog`；`discover`/`test` 的登录、校验、限流、key 规则、响应白名单；`settings` 的存储 id、无 key 改模型、`key_required`）；`settings-state.test.ts`（切供应商清 key；迟到响应丢弃；`ready` 只由已保存 key、版本匹配的测试置位并在编辑/保存后失效；`saveRequest` 在 key 输入为空时省略 `apiKey`；`probeRequest` 用行的模型；保存后 key 输入清空）；`data/sources/llm.test.ts` 与 `copilot/route.test.ts` 各加一条 `authHeader/authPrefix` 透传断言。
11. 文档：本文 + §9 变更说明（含旧 id 映射表）；PR 描述列映射表；给 PA session 回报（§10）。

不做：

- 不改 `llm_settings` 表；不加 `preferred_endpoint` 等注册表字段；不 fork 注册表数据结构。
- 不接 Gemini 原生协议、不接 Ollama。
- 不拉 PA 只读端点（阶段 1 之后）。
- 不改 `copilot` 的 provider 回退、预算、计费逻辑。
- 不做 Playwright 新用例（本地 dev server 走查 + vitest；e2e 需真实供应商 key，不进 CI）。

## 4. 数据流

```
注册表快照 providers.json ──derive.ts('alpha')──▶ 14 家 { protocol, endpoint, base, chat_path, ... }
                                   │ Alpha 覆盖：doubao → anthropic-messages 端点
                                   ▼
                     providers.ts PROVIDERS / getProvider(idOrAlias)
                        │                                   │
       resolve.ts（用户行 provider 反查 → def）        /api/llm/catalog（目录 + models.json 模型）
       → llmConfigFor → ResolvedLlm{ provider: 规范 id } /api/llm/discover（GET discovery，不计费）
                                                       /api/llm/test（llmConfigFor + 真实适配器，1 token）
                                                       /api/llm/settings（写存储 id）
```

## 5. 别名与存量映射

| `llm_settings.provider` 现值 | 反查结果（规范 id） | 端点 | 变化 |
|---|---|---|---|
| `ark` | `doubao` | `https://ark.cn-beijing.volces.com/api/coding` + `/v1/messages`（anthropic） | 逐字不变 |
| `deepseek` | `deepseek` | `https://api.deepseek.com` + `/chat/completions` | 逐字不变 |
| `openai` | `openai` | `https://api.openai.com/v1` + `/chat/completions` | 逐字不变 |
| `kimi` | `kimi_cn` | `https://api.moonshot.cn/v1` + `/chat/completions` | 逐字不变 |
| `minimax` | `minimax_cn` | `https://api.minimaxi.com/v1` + `/text/chatcompletion_v2`（存储 id 为 `minimax` 的行，不论模型） | 逐字不变；本版设置页保存的行写 `minimax_cn`，走 `/chat/completions` |

`getProvider()` 对旧 id 返回的 def 的 `id` 是规范 id、`legacyId` 是旧 id；`chatPathFor(def, storedProviderId)` 只对 `minimax` 这个存储 id 返回旧路径。`ResolvedLlm.provider` 为规范 id：用量记录、`attemptedModels` 键、简报的 `source` 字符串里原来的 `ark/kimi/minimax` 变为 `doubao/kimi_cn/minimax_cn`；`PRICE_REGISTRY` 只有 `deepseek` 条目，不受影响。

## 6. 安全与边界

- 密钥只在服务端：`discover` / `test` 的响应与错误不含密钥、请求头、URL、上游响应原文；只有 `class` 与 HTTP 状态。
- 已保存 key 的使用绑定供应商：请求 provider ≠ 已保存 provider（反查后）时拒绝用已保存 key，防止把 A 家的 key 发到 B 家地址；前端切换供应商时清空明文 key，防止显式提交把 A 的 key 发给 B。
- `discover` / `test` 要求登录、限流、请求体与字段校验；永不用 env key。
- 所有携带 BYOK 的请求（两个适配器、discovery、probe）`redirect: 'error'`。
- discovery 请求：`redirect: 'error'`、8 s、1 MB、id 正则；URL 由注册表数据拼接，请求体里没有用户输入进 URL。
- `model` 入库前过正则；`provider` 入库前经 `resolveProviderId`。
- 目录路由不读 cookie 也不返回任何用户数据。
- 快照 JSON 是仓内文件，运行时不联网。

## 7. 验收

- `npm run typecheck`、`npm run lint`、`npm test`（全量）通过。
- `deriveProviders('alpha')` 的 TS 移植与 PA `derive.js` 输出逐项相等；5 家旧 id 全部反查成功，5 家存量行的 `base + chat_path` 逐字相同（含 `minimax` 旧 id 下的任意模型名）；`minimax_cn` 新行走新路径。
- 本地 dev server（`supabase start` + 本地账号）走通：选供应商 → 填 key → 测试连接（显示延迟与模型数）→ 勾模型 → 保存 → 模型行测试调用 → 徽标变 `ready`；失败路径显示 class + 状态码 + 动作，不含上游文本。
- Codex 设计审与 code review 无 P1/P2。

## 8. 实施切片（单 PR，提交按序）

1. 注册表快照 + `derive.ts` + 对拍 fixture + 测试。
2. `providers.ts` 派生 + 别名反查 + 默认模型规则 + 测试；`resolve.ts` 适配 + 测试；`LlmConfig.authHeader` 透传。
3. `errors.ts` + `discover.ts` + 测试。
4. 四条路由 + 测试。
5. `LlmSettings.tsx` 重做 + i18n。
6. 本地走查、文档、PR。

## 9. 变更说明（随实施更新）

- 供应商目录由注册表快照派生（来源见 `src/lib/llm/registry/SOURCE.md`）。
- 旧 id 映射见 §5；数据不迁移；`ark / deepseek / openai / kimi` 继续以旧 id 存储，MiniMax 本版保存写 `minimax_cn`。
- MiniMax：存储 id `minimax`（旧行、env）→ `/text/chatcompletion_v2` 不论模型；`minimax_cn`（本版保存）→ `/v1/chat/completions`；设置页推荐 `models.json` 最新。
- env 回退的默认模型 5 家逐字不变。
- 用量记录里的 provider 字符串按 §5 改名。
- PA 回复（2026-10-18，分支 `codex/llm-registry-endpoint-auth`，未合并）：注册表将加端点级 `auth` 覆盖（gemini 的 OpenAI 兼容端点声明 Bearer）并在 overrides 补 5 条 doubao 条目（上下文 256k / 输出 32k 为保守值，待核对）。2026-10-19 已刷新快照到 PA `main` `6b52e76a`（包 `e3ff7019`）：`derive.ts` 移植 `authFor`，`providers.ts` 的鉴权头全部来自注册表端点级 auth，"openai 一律 Bearer"规则删除（结果不变：gemini 兼容端点声明 Bearer）；doubao 有 5 条 override 条目但没有 `release_date`，"最新"规则无意义，`doubao-seed-code` 的推荐钉死保留。env 变量名按 `secret.id → Alpha env` 的映射留在 Alpha 侧（即现在的 `ENV_KEY`）。PA 线上只读端点已上线，Alpha 仍用仓内快照（拉取 + 快照兜底留到下一步）。
- **回滚**（r2 P2-8）：回滚到旧版代码前，`llm_settings.provider` 中旧版不认识的值（`minimax_cn` 与所有新供应商 id）会让旧版 `resolveUserLlm()` 返回 null 并回落平台 key。回滚步骤：先 `select user_id, provider from llm_settings where provider not in ('ark','deepseek','openai','kimi','minimax')` 看影响范围，再决定把 `minimax_cn` 改回 `minimax`（路径也随之回旧版）并删除其余行（用户重新填 key），然后才回滚部署。设置页在本版不会产生除此之外的状态。
- 后续工作（本次不做）：`getUserLlm()` 读取失败与解密失败在 `resolveLlm()` 里回落平台 key 的既有行为；组件级 jsdom 交互测试；本地 Supabase（PG 15）跑不过 anchor runner 迁移。

## 10. 回报 PA session（实施后发送）

1. Alpha 需要注册表补什么：`doubao` 在 `models.json` 无条目（models.dev 无来源；Alpha 侧暂钉 `doubao-seed-code`）；`auth` 应按端点而不是按供应商（gemini 的 OpenAI 兼容端点要 Bearer，Alpha 侧已按协议处理）；Alpha 的 env 变量名 `KIMI_API_KEY` 与 `secret.env` 的 `MOONSHOT_API_KEY` 不同（Alpha 保留自己的，不改）。
2. Alpha 实际使用的别名与 `providers.json` 一致：`ark→doubao`、`kimi→kimi_cn`、`minimax→minimax_cn`、`openai`、`deepseek`。ARK coding plan 端点由 Alpha 侧显式覆盖，不需要 `preferred_endpoint`。
