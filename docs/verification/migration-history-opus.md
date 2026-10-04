# 审查结论：离线迁移历史比对工具

**未发现阻断性的正确性缺陷。** 以下结论只依据所提供的代码静态审阅得出，没有执行任何测试。

## 已核对的要点

- **前缀比对逻辑正确。** 对每个下标 i，代码同时检查严格递增、版本在本地清单中存在、以及 `v === localVersions[i]`。这三条合起来保证导出是本地有序清单的前缀。重复、乱序、空洞和未知版本都会失败。`pending` 恰好是未应用的后缀。
- **时间校验正确。** 先检查 `isFinite`，再调用 `toISOString`，所以不会抛出未捕获的 RangeError。往返相等的要求排除了非规范时间格式。未来时间和超过 24 小时的时间都会被拒绝。
- **键集合校验正确。** `JSON.parse` 产生的 `__proto__` 是自有属性，会出现在 `Object.keys` 中，因此会被拒绝。`captured_at: undefined` 也会被拒绝。
- **CLI 行为正确。**
  - 1 MiB 的上限判断正确：缓冲区为 1048577 字节，读满即判定超限。
  - 所有异常（包括 `migrationInventory()` 抛出的异常和深层嵌套导致的栈溢出）都被统一捕获，只输出通用信息，不回显内容或路径。
  - 代码没有数据库或网络调用。

## 非阻断问题（3 项）

### 1. `historySha256` 不是导出文件的摘要，但文档容易让人这样理解

文档要求"retain its digest with release evidence"。但 `historySha256` 是对重新序列化的规范对象计算的，不是对原始文件字节计算的。操作员如果对保存的原始文件执行 `sha256sum`，结果不会与输出一致，证据链就无法复核。

建议二选一：
- 另外输出原始输入字节的 sha256；
- 或在文档中明确说明这是"规范化内容摘要"，并给出复算方法。

### 2. 防泄漏测试的检测力不足

CLI 测试写入的是 `'synthetic-secret-DO-NOT-ECHO'`，然后断言 stderr 不包含 `DO-NOT-ECHO`。问题在于，Node 的 JSON `SyntaxError` 消息只截取输入开头一小段（形如 `Unexpected token 's', "synthetic-"... is not valid JSON`）。假如将来有人把 `catch` 改成输出 `err.message`，标记子串很可能根本不会出现在消息里，测试照样通过，回归无法被发现。

另外，超限用例只断言了退出码，没有断言 stdout 为空、stderr 不含内容。

建议：
- 把标记放在输入开头，例如 `'DO-NOT-ECHO…'`；
- 增加一个"合法 JSON 但含未知字段（带标记）"的 CLI 用例，同时断言 stdout 为空，并且 stderr 中不含标记和文件路径。

### 3. "先按字节锁校验本地清单"的说法在所给代码中无法验证

`verifyMigrationHistory` 只检查 `sha256` 是否为 64 位十六进制，不会比对实际文件字节。文档中"checked against its existing byte lock first"的说法完全依赖 `research-checks.ts` 中 `migrationInventory()` 的实现，而这部分代码不在本次提供的范围内。

需要确认两点：
- `migrationInventory()` 确实对锁文件与磁盘字节做了比对，并且在不一致时抛错；
- 导入该模块没有顶层副作用，例如在导入时就运行其它检查、打印输出或调用 `process.exit`。否则会破坏"只输出比对结果"的约定。

如果确认不成立，就需要修正文档或代码。