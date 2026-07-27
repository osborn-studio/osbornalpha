# AI 平台额度、Token 成本计量与单用户日成本上限设计

**日期**：2026-07-28  
**状态**：已获口头设计批准，等待书面规格复核  
**适用分支**：`codex/stock-detail-live`

## 1. 目标与政策

本次调整同时解决体验额度、真实成本审计和成本失控三个问题：

- 免费档 Copilot 平台额度调整为每用户每天 20 次。
- Pro Copilot 平台额度调整为每用户每天 100 次，不再通过免费档乘数推导。
- Copilot 每轮模型调用的最大输出从 3000 tokens 调整为 9000 tokens；最多 12 轮保持不变。
- 每个用户每天所有平台 Key AI 功能合计成本不得超过 8.8 元人民币。
- 日界统一使用北京时间自然日，00:00 重置。
- 用户自带 API Key（BYO）继续记 token 流水，但不占平台次数和成本预算。
- `role=admin` 继续豁免次数和成本上限。

成本上限覆盖以下平台 Key 功能：

- `copilot`
- `perspectives`
- `brief_preview`

行情、K 线、雷达、定时简报正文及其他不使用平台 LLM 的功能不计入。

## 2. 当前生产模型与定价基线

生产配置使用 DeepSeek 官方 API，模型为 `deepseek-v4-flash`。本设计使用 2026-07-28 官方价格作为首个价格版本：

| 项目 | 美元/百万 tokens |
|---|---:|
| 缓存命中输入 | 0.0028 |
| 缓存未命中输入 | 0.14 |
| 输出 | 0.28 |

价格来源：DeepSeek 官方 Models & Pricing 页面。价格可能变化，因此运行时不得把一个永久价格常量当作历史事实。

人民币折算默认采用 `1 USD = 7.20 CNY`，可通过服务端环境变量调整。每条已结算流水保存调用时使用的价格与汇率快照，后续改价不重算历史记录。

## 3. 方案选择

采用“原子预算预留 + 实际用量结算”：

1. 每次平台模型调用前，根据当前输入上下文、模型价格及最大输出上限计算保守预留成本。
2. 通过数据库函数在单个事务内读取用户当日已结算成本和未释放预留，并尝试新增预留。
3. 若新增预留会使当日总额超过 8.8 元，则拒绝该轮模型调用。
4. 模型响应后读取供应商返回的 token usage，计算真实成本并原子结算，释放预留差额。
5. 调用失败、超时或进程可确认中止时释放预留；无法正常释放的预留通过过期时间自动失效。

不采用单纯事后记账，因为并发调用可能共同越过硬上限；不采用永久按最坏值扣款，因为会造成不必要的预算浪费。

## 4. 配额模型

现有 `BASE_LIMITS + PRO_MULTIPLIER` 改为显式计划矩阵：

| 功能 | Free | Pro | Admin |
|---|---:|---:|---:|
| Copilot | 20 | 100 | 无限 |
| 九人观点 | 5 | 50 | 无限 |
| 简报预览 | 2 | 20 | 无限 |

本期只调整用户明确指定的 Copilot Free/Pro 次数；另外两个功能保持现有值。未知、空或过期计划仍回退到 Free。

次数配额按一次成功完成的功能运行计数。Copilot 一次运行内部可能包含多轮模型调用，但只消耗一次 Copilot 次数。平台运行开始前仍检查次数额度；成功完成后写入功能用量流水。成本预算则在每一轮实际模型调用前单独预留和结算。

## 5. 数据模型

### 5.1 扩展 `usage_events`

保留 `usage_events` 作为用户可见的功能运行流水，增加可审计字段：

- `provider text`
- `model text`
- `input_tokens bigint not null default 0`
- `cache_hit_input_tokens bigint not null default 0`
- `cache_miss_input_tokens bigint not null default 0`
- `output_tokens bigint not null default 0`
- `cost_micrormb bigint not null default 0`
- `pricing_version text`
- `usd_cny_micros bigint`

现有 `tokens_in`、`tokens_out` 先保留以兼容旧代码和查询；新代码同时写入兼容字段，后续迁移再单独删除。

一条功能运行可能包含多轮模型调用，因此 `usage_events` 保存该次运行聚合后的 token 与成本。

### 5.2 新增 `llm_cost_reservations`

每轮模型调用使用独立预留记录：

- `id uuid primary key`
- `user_id uuid not null`
- `feature text not null`
- `provider text not null`
- `model text not null`
- `reserved_micrormb bigint not null`
- `settled_micrormb bigint`
- `status text check (status in ('reserved','settled','released'))`
- `expires_at timestamptz not null`
- `created_at timestamptz not null`
- `settled_at timestamptz`

索引覆盖 `(user_id, created_at)` 和未完成预留。客户端不能直接写入该表；仅服务端数据库函数可预留、结算和释放。

### 5.3 原子数据库函数

新增服务端专用函数：

- `reserve_llm_daily_budget(user_id, feature, provider, model, requested_micrormb, daily_limit_micrormb)`
- `settle_llm_budget(reservation_id, actual_micrormb)`
- `release_llm_budget(reservation_id)`

预留函数在事务中锁定用户当日预算键，清理或忽略已过期预留，计算：

`当日已结算 + 当前有效预留 + 本次请求预留 <= 8_800_000 微元`

仅满足该条件时创建预留。数据库函数仅授权 `service_role`，不授权 `anon` 或 `authenticated`。

## 6. Token 与成本计算

LLM 适配器统一返回：

- `input_tokens`
- `cache_hit_input_tokens`
- `cache_miss_input_tokens`
- `output_tokens`

DeepSeek/OpenAI 兼容响应优先读取缓存细分字段；若供应商仅返回总输入 tokens：

- 未提供缓存拆分时，全部按缓存未命中价格计费，保证成本估算保守。
- 缓存命中与未命中之和不得超过总输入；异常响应回退到全部未命中。

成本计算使用整数：

`cost_micrormb = ceil(tokens × usd_per_million × usd_cny × 1_000_000 / 1_000_000)`

计算函数是纯函数，按供应商、模型和价格版本查表。未知模型不得按零成本放行：平台调用应使用可配置的保守回退价格；若没有有效价格则拒绝平台调用并记录稳定错误码 `pricing_unavailable`。BYO 调用仍可执行，但成本字段可为空或为 0，并明确 `byo=true`。

预留成本包括：

- 当前序列化输入的保守 token 估算；
- 9000 个最大输出 tokens；
- 当前供应商/模型的缓存未命中输入价格。

结算一律采用供应商响应的实际 usage。若响应缺失 usage，按预留金额结算并记录 `usage_estimated=true`，确保硬上限不会因为缺失计量而失效。

## 7. 应用调用流程

### 7.1 Copilot

1. 解析用户或平台 LLM。
2. BYO 直接执行，不检查平台次数或成本预算，但聚合真实 token。
3. 平台 Key 在运行开始前检查 Copilot 日次数。
4. 每轮调用前申请成本预留；失败则发送 `daily_cost_exhausted` SSE 错误并终止运行。
5. 将每轮 `max_tokens` 设为 9000。
6. 每轮返回后立即结算预留并累加 token、成本。
7. 整次运行完成后写一条聚合的 `usage_events`。
8. 运行中途失败时，已经完成的模型轮次成本必须保留；仅释放尚未结算的当前预留。

### 7.2 九人观点

每次真实模型调用采用相同的预留/结算包装器，最终在功能流水中聚合 token 与成本。次数额度保持 Free 5 / Pro 50。

### 7.3 简报预览

`skipLLM=true` 继续不计量。使用 LLM 时采用相同预留/结算逻辑，最终写入聚合流水。次数额度保持 Free 2 / Pro 20。

### 7.4 平台回退

BYO 供应商失败后若尝试平台回退，必须在回退前同时检查平台次数和成本预算。实际使用平台回退时，该次运行按平台调用计入次数及成本；未发生回退的 BYO 调用不计入平台预算。

## 8. 错误与用户体验

次数和成本使用不同稳定错误码：

- `quota_exhausted`：功能次数已用完。
- `daily_cost_exhausted`：用户当日平台成本预算不足。
- `pricing_unavailable`：平台模型缺少有效价格配置。

成本用尽提示应明确：

> 今日平台 AI 成本额度已用完（8.8 元/天）。可使用自己的 API Key，或等待北京时间 00:00 重置。

次数卡继续显示 `used/limit`。设置页“今日用量”增加当日平台 AI 成本汇总，但只展示人民币金额和上限，不暴露平台密钥或供应商原始响应。

## 9. 配置

新增服务端环境变量：

- `LLM_DAILY_COST_LIMIT_MICRORMB=8800000`
- `LLM_USD_CNY_MICROS=7200000`
- `LLM_RESERVATION_TTL_SECONDS=300`
- 模型价格配置采用代码内版本化注册表；价格变化通过代码审查发布。

环境变量无效时使用上述安全默认值并记录配置告警。客户端不得决定或覆盖成本上限、汇率和价格。

## 10. 并发、失败与安全

- 原子预留是硬上限的唯一授权路径，应用层先查后写不能替代数据库事务。
- 预留 ID 只在服务端流转。
- 结算与释放必须幂等，重复 webhook/重试不能重复扣费。
- 过期预留不计入可用预算，避免进程崩溃永久锁死用户额度。
- 数据库或预算服务不可用时，平台 Key 调用失败关闭，避免无计量烧费；BYO 调用不受影响。
- 价格、token、成本和错误码可以进入审计日志；提示词、完整模型响应、API Key 不进入成本日志。

## 11. 测试与验收

### 纯逻辑测试

- Free Copilot 为 20，Pro Copilot 为 100，其他功能保持 5/50 和 2/20。
- Admin 无限；未知/过期计划回退 Free。
- 北京时间日界跨越正确。
- DeepSeek 缓存命中、未命中、输出及汇率整数换算正确。
- 缺失缓存拆分按全部未命中计算。
- 缺失 usage 按预留金额结算。
- 9000 `max_tokens` 被传入每轮 Copilot 模型调用。

### 数据库测试

- 两个并发预留不能共同突破 8.8 元。
- 结算释放差额，重复结算不重复扣费。
- 释放幂等。
- 过期预留不占预算。
- 北京时间跨日后获得新预算。
- 非 `service_role` 不能调用预留/结算函数或直接写预留表。

### 路由测试

- 次数耗尽返回 `quota_exhausted`。
- 成本耗尽返回 `daily_cost_exhausted`。
- 缺少价格返回 `pricing_unavailable`。
- BYO 不受次数或 8.8 元上限影响。
- Copilot 多轮 usage 正确聚合。
- BYO 回退平台时执行成本预留并计入平台流水。
- 简报 `skipLLM=true` 不产生预留或成本。

### 完成标准

- 全部新增和既有单元测试通过。
- TypeScript 类型检查通过。
- 生产构建通过。
- 数据库迁移可在空数据库和已有 `usage_events` 数据库上执行。
- 设置页可以区分次数耗尽和成本耗尽。
- 不存在未经过成本预留的生产平台 LLM 调用路径。

## 12. 发布与观察

1. 先发布数据库迁移和向后兼容代码。
2. 配置 8.8 元上限、汇率及预留 TTL。
3. 发布应用代码。
4. 验证 Free 20、Pro 100、BYO 豁免及 9000 输出上限。
5. 首周每日检查用户级 token、成本、预留过期率和拒绝次数。
6. DeepSeek 调价或汇率策略变化时发布新的价格版本。

回滚时可恢复旧次数和 3000 输出上限；成本预留表与审计字段保留，不删除历史数据。

## 13. 非目标

- 本期不改变 Pro 售价或支付流程。
- 不调整九人观点和简报预览的次数额度。
- 不建立全局平台月预算或组织级预算。
- 不按股票、IP 或设备额外限流。
- 不实现动态外汇行情抓取。
