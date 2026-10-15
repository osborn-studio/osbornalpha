# 第二轮复审结论（D1/D2）

**结论：没有发现需要阻断本批代码合并的问题。** 首轮的 ACL 发现已经关闭。另有一处与"重复信号已处理"这一声明不符，建议在本批顺手修正，但它不构成 CI 假绿、正确性或安全阻断。

下文所有判断只基于你提供的代码和报告，我没有执行任何东西。

## 一、ACL 断言是否已非空洞：已关闭

- `alter default privileges for role s4_admin ... grant all on tables` 在任何迁移执行之前生效，所有迁移也都以 `s4_admin` 身份执行。因此，迁移期间新建的表都会默认带上 `authenticated` 的 UPDATE 权限。
- `watchlist_alerts` 的 UPDATE 为 true，证明默认授权确实生效，这是正向对照。
- `watchlist_alert_events` 的 UPDATE 为 false，就只能是 revoke 生效的结果，不再是"本来就没授权"。
- 函数方面，PG 默认对 PUBLIC 授予 EXECUTE。所以 `claim`/`anon` 为 false 本来就需要显式 revoke，不依赖这里的 bootstrap。
- 这个 bootstrap 只在 rehearsal 里开启（`rehearsalDefaultTableGrants`），fresh 库和 seeded 库对称开启，不会污染 `test:db` 的 RLS 套件，也不会让 schema diff 产生假差异。

## 二、建议修正（非阻断）

### 1. `research-db.ts` 的重复信号没有处理，第二次信号会泄漏 PG 进程

- **路径**：`scripts/ci/research-db.ts` 中的 `process.once('SIGINT', stop); process.once('SIGTERM', stop);`
- **触发场景**：本地连按两次 Ctrl-C，或者在清理过程中再收到一次同类信号。
  - 第一次信号触发 abort，监听器随即被移除。
  - 第二次信号走 Node 默认处理，直接退出，`finally` 里的 `stopLocalDatabase` 不会执行。
- **后果**：
  - `pg_ctl start` 拉起的 postmaster 是脱离父进程的，会继续在 127.0.0.1 的随机端口上运行。
  - 临时目录会被残留，里面有 `password` 和含超级用户 URL 的 `state.json`。虽然目录是 0700、只限本机，但这正是本批目标"清理自己的 PG 进程"要防止的情况。
  - 你说明里写的"repeated signals handled"只在 `migration-rehearsal.ts` 中成立，那里用的是 `process.on`。
- **修法**：改成 `process.on`。`stop` 本身是幂等的（`abort()` 重复调用不会出错），`finally` 里已经有 `removeListener`，不需要其他改动。
- **CI 影响**：GitHub 取消任务时，最终会在一段宽限期后发 SIGKILL，任何处理器都拦不住；而且 runner 是一次性的。所以这个问题不影响 CI 结论。

## 三、需要在首次 Linux CI 中观察，不判定为缺陷

- **安装后的集群检查可能误报失败**：ubuntu-24.04 镜像可能预装了 PG16，并带有一个默认的 16/main 集群。如果安装 `postgresql-17` 时 postinst 启动了 `postgresql` 服务，并按 `start.conf` 拉起了 16/main，那么 `pg_lsclusters ... exit 1` 会让 CI 变红。
  - 这是失败关闭（fail-closed），不是假绿。
  - harness 使用随机端口和独立数据目录，不会碰到 16/main。
  - 如果真的出现，应改为只检查版本 17 的集群，或在检查前显式停掉预装集群。不建议删掉这条检查。

## 四、复核后认为没有问题的点

- **`test:db` 失败时**：summary 文件会被预先删除，失败路径不会写入，所以 artifact 上传只会得到 warn，不会留下旧的绿色报告。
- **Vitest 门禁**：`success !== true`、关键套件缺失、`assertionResults` 为空、存在任何非 passed 状态，都会失败。
- **清理错误的保留**：
  - `startLocalDatabase` 的 catch 分支、`research-db` 的 finally、rehearsal 的 finally 都会通过 AggregateError 保留原始错误。
  - 在 pid 文件仍存在的情况下，目录会被保留而不是强删。
  - 启动超时的情况也会按 pid 文件判断是否需要回收。
- **迁移锁**：
  - 39 个已锁迁移逐字节校验。
  - 新增的未锁文件只要版本号不大于锁内最大版本，就判为 non-append，可以拦截往历史中间插入迁移。
  - `.gitattributes` 中的 `-text` 保证 checkout 出来的字节与 index 一致，Linux 上的哈希与 lock 可比。
- **pg_dump 密码**：只通过子进程环境变量传入，不会出现在 argv 或报告里。
- **环境隔离**：脚本会拒绝继承 PG/Supabase 相关的环境变量、`.env` 文件和已有的 `S4_TEST_STATE`。`S4_TEST_STATE` 只注入给 Vitest 子进程，不会让父进程自我拒绝。

合并前仍需遵守文档中已写明的 release hold，也就是先核实生产分支的自动迁移和 branching 路径。这一点不属于本次代码缺陷。