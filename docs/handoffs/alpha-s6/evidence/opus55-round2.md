# S6 修复复核（静态审阅，仅依据所贴源码）

**结论：** 未发现可证实的 P0。原 P1（新版本任选 as_of/market 导致状态回退）在所示源码中已关闭。未发现新的可证实 P1，但第 1 项在一个条件下会升为 P1。以下是遗漏修复和关键 P2。

以下内容本次看不到，凡依赖它们的结论都标为"条件"：
- 引擎包内部：`validateCommit`、`replayObservation`、`evaluateObservation` 对 as_of 的校验
- S4 的 records / decisions / auth 实现
- 第一个 S6 迁移

## 已核实关闭

- **as_of 与行情集**：新版本的检查顺序是：会话鉴权 → `validateCommit` → 权威输入重建与比对 → 重算 → 原 body 幂等 → 时间线检查 → 当前行情集检查 → CAS（`store.ts:94-108`）。
  - 时间线要求 as_of ≥ max(上一版本 as_of, now−5min)。
  - 当前行情集必须全集相等，遗漏会返回 `source_version_conflict`。
  - 旧 body 的 duplicate 在时间线检查之前返回，所以旧重试仍然有效。
- **会话鉴权**：预认证在 owner 锁之前（`db.ts:27`），锁后在 `run` 内再验一次（`store.ts:88`）。
- **Replay**：按 ID 单独查询，不受 100 条列表限制（`report.ts:14`）。导出时逐份核对行情快照的 hash、原字节和证据。
- **BOM 与失败处理**：BOM 按原字节保留（`ignoreBOM:true`）。非 2xx 和超限时都会 cancel。
- **UI**：提交成功但刷新失败时单独提示（`EvaluationPanel.tsx:27`）。

## 遗漏修复 / 关键 P2

**1. 落库与状态写入用的是 `body.result`，不是重算结果**（`store.ts:111-112`，条件 P1）

- 第 99 行只比较了 `computed.result_sha256 === body.result_sha256`，没有比较 `body.result` 本身。
- 如果 `validateCommit` 不校验 `digest(body.result) === body.result_sha256`，攻击者可以提交"真 hash + 伪造 result"。这样伪造的 `result` 会落库，observation 的 `status=$4` 也会被改写。report 读取时第 16 行会报 `hash_mismatch`，但状态和 revision 已经推进了。
- 现有测试第 82 行只覆盖了"伪 result + 伪 hash"。
- **修复：**
  - insert 和 update 改用 `computed.result` 与 `computed.result.status`。
  - 补一条"真 hash + 假 result"的测试。
- **同类依赖：** store 从不比较 `body.owner_scope`。测试第 76 行的 403 完全依赖包内行为，而且它复用了已接受的 idempotency key，可能被其他路径掩盖。建议改用新 key，并在 store 里显式拒绝与 actor 不符的 `owner_scope`。

**2. commit 按 `now` 而不是按 `as_of` 校验当前行情集**（`store.ts:107`，对比 `inputFor:56-66`）

- prepare 的语义是"as_of 时已入库的最新集"（`currentMarketIds` 带 `fetched_at<=asOf`）。commit 却只校验"now 时的集合"，`inputFor` 也不校验各行情的入库 `fetched_at ≤ as_of`。
- **后果：** HTTP evaluator 可以选 5 分钟窗口内较早的 as_of，同时带上此后才冻结的行情。这不会导致状态回退，但冻结输入会声称"截至 as_of"，实际却含 as_of 之后才入库的信息。同一 as_of 下，prepare 与已接受版本的集合也会不一致。
- **修复：** 同时要求 `currentMarketIds(asOf) == body 集合 == currentMarketIds(now)`。
- **附带问题：** 第 71 行在 provider `fetched_at` 相同的情况下按随机 UUID 选 "最新" 快照，结果是任意的。建议改为按入库时间排序，或直接拒绝同一 `fetched_at` 但字节不同的快照。

**3. S6 错误映射漏了 S4 的两类错误**（`s6/http.ts:9-14`，对比 `s4/http.ts:16,19`）

- `s6Http` 没有处理 `ResearchForbidden`，也没有把 `source_withdrawn` 列为 403。
- `requireS4Actor` 和 `observationFor → candidateFor` 走的是 S4 代码。在 S6 路由上，这两类错误会变成 500 `internal_error`。
- UI 会把 500 当作可重试并保留 attempt（`EvaluationPanel.tsx:13`）。这与"报告错误原因"这项修复的目标直接冲突。
- **修复：** 与 `s4Http` 共用同一张映射表。

**4. "session 1h" 约束可被绕过**（迁移第 2-3 行，`store.ts:16`）

- CHECK 只约束 `expires_at ≤ created_at + 1h`，而 `created_at` 可以在 insert 或 update 时显式写成未来时间。例如 `created_at='2099…'` 能通过检查，得到一个实际上长期有效的 token。
- `authorizeSession` 不检查 `created_at ≤ now`。
- `revoked` 可以从 true 改回 false，测试第 71 行本身就依赖这一点。
- 迁移在表非空时会失败：旧行的 `created_at` 被填为迁移时刻，而旧行的 `expires_at` 可能超过该时刻 + 1h。
- **修复：**
  - 用触发器在 insert 时强制 `created_at = clock_timestamp()`，并禁止更新 `created_at`、`user_id`、`token_hash`。
  - `revoked` 只允许单向变为 true。
  - 鉴权时加 `created_at ≤ now`。

**5. 现有证据不足以证明 shadow 不污染主线**（`shadow.ts:21-26`，测试第 100-107 行）

- **已确认：**
  - 首次 fixture 运行时，exposure 在返回前、同一事务内落库。
  - 真实（非 synthetic）observation 会被拒绝（第 17 行）。
  - `shadow` 模式被拒绝（第 12 行）。
- **未能证实"不污染"：**
  - REL 写入的 `ExposureEvent` 与主线使用同一 kind 和同一 `subject_refs`。`ControlEvent` 也进入同一条候选链和 outbox。
  - 测试只比较了 ChangeCard 和 `readObservation`。它没有覆盖后续 `revealCards` / `submitDecision` 的独立性判断、`contamination_reasons`、周期曝光统计，也没有覆盖 fixture 写入失败会让主链进入 `integrity_failed` 的路径。
- **次要问题：** 第 19 行的幂等重放直接返回旧响应，不再记录 exposure。这与 report "每次展示都记 exposure" 的做法不一致。

**6. Replay 未显式校验被选中行的 hash**（`report.ts:14-24`）

- 列表行有 `digest(result) === result_hash` 校验（第 16 行），但按 ID 选中的行没有。
- `receipt.input_sha256` 与 `selected.input` 的一致性也没有校验，只依赖 `replayObservation` 的内部实现。
- 表有不可变触发器，所以风险较低，但显式加一行校验的成本很小。

## 验收状态（应如实标注）

- **S6.2 真实 provider 验收：待完成。**
  - `authorized-provider` 这条路径只受 `ALPHA_S6_REAL_MARKET=1` 开关控制，证据是调用方传入的对象（`market.ts:12,19,24`）。
  - 所示源码中没有可信的 `evidenceFor` 解析器。导出中的 `kind:'authorized-provider'` 只是一个标签，不是证明。
  - `market.test.ts` 用的是 loopback 合成服务器。
- **S6.4 真实 shadow readiness：待完成。**
  - 只有 disabled 和 fixture 两种模式。billing 固定为 `fixture_no_charge`，响应中标 `real_shadow:'not_run'`。
- **范围：** 两个测试文件都只覆盖本地、合成（S6SYNTH）场景，不能称为全站真实验收。也未涉及生产环境、真实行情或 Jev 权限。