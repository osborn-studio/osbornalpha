# D1/D2 独立审计（仅基于所给材料，未运行任何代码或测试）

**总体判断**：主干设计是 fail-closed 的。环境变量拒绝、`.env` 拒绝、随机端口、SCRAM 认证、逐文件核对 assertion status、vitest 非 0 退出即 reject，这些都成立。但距离"CI 同样跑全套、只清理自己的 PG"还有缺口。第 1、2 项建议在声称 D1/D2 完成前修掉，第 3–6 项属于加固。

---

## 1. 【CI 假绿 / 范围缺口】迁移演练在 CI 中完全没有运行

- **路径**：`package.json` 没有调用 `scripts/ci/migration-rehearsal.ts` 的 script，`ci.yml` 也只跑 `npm run test:db`。
- **触发条件**：恢复的 SQL 或后续迁移破坏了"已有数据升级"路径，例如 `source_key set not null` 的回填失败，或 `watchlist_items` 新增 not null 列时失败。这时 CI 依然是绿的，因为 `test:db` 只走空库全新建库路径。`reports/migration-rehearsal.json` 只是本地产物，CI 既不重现也不比对。
- **修法**：
  ```json
  "test:migrations": "tsx scripts/ci/migration-rehearsal.ts"
  ```
  ```yaml
  - run: npm run test:migrations
    env: { S4_POSTGRES_BIN: /usr/lib/postgresql/17/bin }
  - uses: actions/upload-artifact@v4
    if: always()
    with: { name: db-reports, path: reports/ }
  ```
  同时建议不要把 `reports/*.json` 当作仓库内的证据提交，以 CI artifact 为准。

## 2. 【资源泄漏 + 根因被吞】`stopLocalDatabase` 失败后不删目录，且会覆盖原始错误

- **路径**：`scripts/s4/local-db.ts` 中的 `stopLocalDatabase`：
  ```ts
  execFileSync(pg_ctl ... 'stop'); rmSync(directory)
  ```
  stop 抛错时 `rmSync` 不会执行。
- **触发条件**：postmaster 在测试期间已经退出（OOM、崩溃、被 runner 杀掉等），此时 `postmaster.pid` 不存在，`pg_ctl stop` 返回非 0。后果有三：
  - **泄漏**：临时目录残留在 `$TMPDIR`。里面有 `password` 文件，还有包含 **superuser 明文 URL** 的 `state.json`，以及整个 data 目录。本地反复运行会持续累积。
  - **吞掉根因**：
    - `local-db.ts` 的 catch 分支里，迁移报错（`Migration xxx: ...`）会被 pg_ctl 的错误替换。
    - `research-db.ts` 的 finally 里，`Vitest exit 1` 会被替换。
    - `migration-rehearsal.ts` 的 finally 会抛出 `'Local rehearsal cleanup failed'`，并且丢弃具体的 error。
- **修法**：
  ```ts
  export function stopLocalDatabase(s: { bin: string; directory: string }) {
    const data = join(s.directory, 'data');
    try {
      if (existsSync(join(data, 'postmaster.pid')))
        execFileSync(join(s.bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe', timeout: 30_000 });
    } catch (e) {
      // 进一步尝试 immediate，仍失败则保留目录，打印路径与 postmaster pid 便于人工清理
      execFileSync(join(s.bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe', timeout: 30_000 });
    }
    rmSync(s.directory, { recursive: true, force: true });
  }
  ```
  调用方用 `AggregateError([primary, cleanup])` 或 `{ cause }` 同时保留两个错误，不要让 finally 里抛出的错误覆盖 try 中的主错误。

## 3. 【"只清理自己的 PG"在 CI 不成立 / 版本未校验】

- **路径一**：`ci.yml` 中的 `apt-get install -y postgresql-17`。Ubuntu 的 postgresql-common 默认 `create_main_cluster=true`，安装时会**自动建立并启动** `17/main` 集群（systemd 服务，端口 5432 或 5433）。测试期间 runner 上因此存在一个不受脚本控制的 PG 进程。被测代码一旦误连默认端口或默认 socket，不会被发现。
- **路径二**：`local-db.ts` 只检查 `initdb` 是否存在，不检查主版本。macOS 上的 `S4_POSTGRES_BIN` 如果指向 16 或 18，测试也会通过，并被当作"PG17 证据"。
- **修法**：
  ```yaml
  run: |
    sudo install -d /etc/postgresql-common/createcluster.d
    echo 'create_main_cluster = false' | sudo tee /etc/postgresql-common/createcluster.d/00-no-main.conf
    sudo apt-get install -y postgresql-common
    ...
    sudo apt-get install -y postgresql-17
    test -z "$(pg_lsclusters -h)"   # 断言没有系统集群
  ```
  ```ts
  const v = execFileSync(join(bin, 'postgres'), ['--version'], { encoding: 'utf8' });
  if (!/\(PostgreSQL\) 17\./.test(v)) throw new Error(`PostgreSQL 17 required, got ${v.trim()}`);
  ```
  同时把实际版本字符串写入 summary。

## 4. 【CI 假绿】关键 suite 名单是硬编码的，无法证明真的连了数据库

- **路径**：`scripts/ci/research-checks.ts` 中的 `criticalSuites` 和 `verifyDatabaseReport`。
- **触发条件 A**：新增或重命名一个真库 suite（例如 `research/xxx.integration.test.ts`），它不在名单里。若它带有 `describe.skipIf(!process.env.S4_TEST_STATE)`，跳过后 `success` 仍为 true，gate 不会报警。重命名关键 suite 时会 fail-closed，这部分没问题，但新增的 suite 完全不受约束。
- **触发条件 B**：某个关键 suite 在 `it` 内部写了 `if (!state) return;` 这类守卫。status 依然是 `passed`，gate 只看 status，于是放行。
- **修法**（只增加门禁，不改业务逻辑）：
  - **名单与实际文件必须相等**：
    ```ts
    const found = globSync('src/**/*.integration.test.ts').sort();
    if (JSON.stringify(found) !== JSON.stringify([...criticalSuites].sort()))
      throw new Error('Integration suite set drifted');
    ```
    `node:fs` 的 `globSync` 在 Node 22 中可用。
  - **证明真的连过库**：在 `research-db.ts` 停库之前，用 admin 连接查询 `pg_stat_database` 中 `datname='postgres'` 的 `xact_commit`，要求明显大于迁移阶段的基线。更精确的做法是让测试 helper `requireTestDatabase()` 在每个 suite 的 `beforeAll` 里写入一条 marker（suite 名），gate 校验 12 条 marker 齐全。
  - **增加一条 contract test**：断言关键 suite 文件中不含 `skipIf`、`.skip(`、`runIf`。

## 5. 【历史迁移字节固定只覆盖 1/39】

- **路径**：`migrationInventory` 只比对 `recoveredMigration` 的 sha256。其余 38 个同样已在生产执行过的文件，hash 只被写进 summary，没有任何比对。
- **触发条件**：有人修改 `20260728150000_profile_entitlement_security.sql` 等已执行文件。空库测试照样绿，但这已经构成"仓库 ≠ 生产已执行"的漂移，而 Supabase CLI 并不比对内容。
- **修法**：
  - 提交 `supabase/migrations.lock.json`，内容是全部 `{file, sha256}`。`migrationInventory` 要求已锁定文件逐字节一致，并且新文件版本号必须大于锁内最大版本，只允许追加。
  - 加 `.gitattributes`：
    ```
    supabase/migrations/*.sql -text
    ```
    防止 autocrlf 改动字节。现有 hash 检查虽然会 fail-closed，但报错会让人困惑。
  - 在锁文件或 PR 说明中记录恢复来源：来自哪个 commit / blob，以及 `31b969…` 是如何得到的。当前 pin 只能防止今后变化，**不能证明**它与生产当时执行的内容一致。这一点应留在"自动迁移路径核实"的待办里，与 `schema_migrations.statements` 比对。

## 6. 【演练覆盖弱，接近同义反复】

- **路径**：`migration-rehearsal.ts`。
- **问题一**：fresh 与 seeded 执行的是完全相同的 SQL，`pg_dump` 结果相等几乎必然成立。真正有信息量的只是"带数据时不报错"加上两处断言。
- **问题二**：`--no-privileges` 跳过了恢复迁移中所有安全相关语句，例如：
  - `revoke update on watchlist_alert_events from anon, authenticated`
  - 先 `revoke all`、再 `grant select` 给 `authenticated` 的 `watchlist_research_refresh_state`
  - 各个 security definer 函数只授给 `service_role` 或 `authenticated`

  本地层面也完全没有验证这些语句的效果。
- **问题三**：seed 不包含 `broker_reports` 和 `perspectives`，因此 `broker_reports.source_key` 回填、`perspectives.brief_id drop not null` 以及新增的 `perspectives_origin_check` 在存量行上的行为都没有覆盖。
- **修法**（只做验证，不改权限）：
  - seed 增加 `broker_reports` 和 `perspectives` 各一行，断言 `source_key = id::text`，且约束通过。
  - 对 fresh 库断言 ACL 快照，例如：
    ```sql
    select has_table_privilege('authenticated','public.watchlist_alert_events','UPDATE'),
           has_function_privilege('authenticated','public.claim_watchlist_alert_events(integer)','EXECUTE'),
           has_function_privilege('anon','public.update_watchlist_item_decision(uuid,integer,jsonb)','EXECUTE')
    ```
    期望值依次为 false、false、false。
  - 把 `schemaHash` 写入锁文件。CI 中出现不同值即失败，让它成为真正的回归门禁，而不是一个不参与比对的数字。

---

## 已确认无问题（避免误报）

- 迁移内的 security definer 函数对表都使用了 `public.` 限定，`set search_path = public` 在这里不构成 pg_temp 劫持风险。
- `local-db.ts` 中 `admin` 的生命周期没有问题：catch 分支 end 之后置为 undefined，finally 不会重复 end。
- 端口探测与启动之间的竞态最多导致启动失败，不会造成假绿。
- 子进程以信号退出时 `code === null`，会被 reject，不会被当作成功。
- 不在本次范围内、但需要保留在待办里的事项：auth / storage 的 stub、superuser 执行迁移与 Supabase 非等价，已由 summary 中的 scope 声明覆盖；Supabase CLI 对乱序版本的处理，属于已声明的"自动迁移路径核实"。