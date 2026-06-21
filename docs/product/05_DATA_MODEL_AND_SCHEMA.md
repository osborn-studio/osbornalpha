<!-- 05 数据模型与 Schema | 用途：osbornalpha 全表结构、列、PK/FK、RLS 策略、注册触发器、枚举详尽参考 | 最后更新 2026-06-20 -->

# 05 · 数据模型与 Schema（Data Model & Schema）

> 事实源：`supabase/migrations/20260515000000_initial_schema.sql`（初始 11 表中的 10 表）+ `supabase/migrations/20260621000000_profiles_and_billing_hooks.sql`（`profiles` 表 + 触发器扩展 + 回填）。
> 所有表均启用 RLS。公共参考表对所有人可读；用户数据按 `auth.uid()` 严格隔离。
> 应用层类型镜像：`src/lib/supabase/database.types.ts`。

---

## 1. 枚举（Enums）

| 枚举 | 取值 |
|---|---|
| `market_t` | `'A'`, `'HK'`, `'US'` |
| `stance_t` | `'bullish'`, `'neutral'`, `'bearish'` |
| `persona_t` | `'buffett'`, `'munger'`, `'druckenmiller'`, `'marks'`, `'lynch'`, `'burry'`, `'zhang_kun'`, `'li_lu'`, `'duan_yongping'`（9 位投资人格） |

---

## 2. 表清单（11 张）

| 表 | 性质 | PK | 隔离键 | RLS |
|---|---|---|---|---|
| `stocks_universe` | 公共参考 | `ticker` | — | 公开读 |
| `financial_history` | 公共参考 | (`ticker`,`fiscal_year`,`period`) | — | 公开读 |
| `watchlists` | 用户 | `id` | `user_id` | 自有 CRUD |
| `watchlist_items` | 用户 | `id` | `user_id` | 自有 CRUD |
| `briefs` | 用户 | `id` | `user_id` | 自有 读/写/删 |
| `stock_signals` | 用户 | `id` | `user_id` | 自有 读/写 |
| `perspectives` | 用户 | `id` | `user_id` | 自有 读/写 |
| `news_items` | 用户缓存 | `id` | `user_id` | 自有 读/写 |
| `broker_reports` | 用户 | `id` | `user_id` | 自有 读/写 |
| `user_preferences` | 用户 | `user_id` | `user_id` | 自有 读/写/更 |
| `profiles` | 用户 1:1 auth.users | `id` | `id` | 自有 读/更 |

---

## 3. 公共参考表

### `stocks_universe`（约 12K 行满载）
| 列 | 类型 | 约束 |
|---|---|---|
| `ticker` | text | **PK** |
| `name` | text | not null |
| `pinyin` | text | |
| `market` | `market_t` | not null |
| `industry` | text | |
| `is_active` | boolean | default true |
| `last_price` | numeric | |
| `updated_at` | timestamptz | default now() |

- 索引：`stocks_universe_name_idx` GIN `to_tsvector('simple', name)`；`stocks_universe_market_idx` on `(market)`。
- RLS：`stocks_universe public read` — `for select using (true)`。

### `financial_history`
| 列 | 类型 | 约束 |
|---|---|---|
| `ticker` | text | **FK → stocks_universe(ticker)** on delete cascade |
| `fiscal_year` | int | not null，PK 组成 |
| `period` | text | default `'annual'`，PK 组成 |
| `revenue` / `net_income` / `roe` / `gross_margin` / `free_cash_flow` | numeric | |
| `updated_at` | timestamptz | default now() |

- **复合 PK**：(`ticker`, `fiscal_year`, `period`)。
- RLS：`financial_history public read` — `for select using (true)`。

---

## 4. 用户数据表

### `watchlists`（每用户股票池）
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** default `gen_random_uuid()` |
| `user_id` | uuid | **FK → auth.users(id)** on delete cascade，not null |
| `name` | text | not null |
| `description` | text | |
| `weight` | numeric | default 1.0 |
| `sort_order` | int | default 0 |
| `is_default` | boolean | default false |
| `created_at` / `updated_at` | timestamptz | default now() |

- 索引：`watchlists_user_idx (user_id)`。
- RLS（4 条，均 `auth.uid() = user_id`）：`select` / `insert with check` / `update` / `delete`。

### `watchlist_items`
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** default `gen_random_uuid()` |
| `watchlist_id` | uuid | **FK → watchlists(id)** on delete cascade，not null |
| `user_id` | uuid | **FK → auth.users(id)** on delete cascade，not null |
| `ticker` | text | not null |
| `conviction` | int | default 5，`check (conviction between 0 and 10)` |
| `notes` | text | |
| `sort_order` | int | default 0 |
| `added_at` | timestamptz | default now() |

- 唯一约束：`unique (watchlist_id, ticker)`。
- 索引：`watchlist_items_user_idx (user_id)`、`watchlist_items_wl_idx (watchlist_id)`。
- RLS（4 条 `auth.uid() = user_id`）：`select` / `insert` / `update` / `delete`。

### `briefs`（每用户每日简报产物）
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** |
| `user_id` | uuid | **FK → auth.users(id)** cascade，not null |
| `brief_date` | date | not null |
| `language` | text | default `'zh'` |
| `ai_confidence` | numeric | `check (between 0 and 10)` |
| `confidence_label` | text | |
| `content_md` | text | |
| `content_json` | jsonb | |
| `total_cost_usd` | numeric | |
| `duration_s` | int | |
| `status` | text | default `'success'` |
| `generated_at` | timestamptz | default now() |

- 唯一约束：`unique (user_id, brief_date, language)`。
- 索引：`briefs_user_date_idx (user_id, brief_date desc)`。
- RLS（3 条 `auth.uid() = user_id`）：`select` / `insert` / `delete`（**无 update**）。

### `stock_signals`（每简报每标的）
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** |
| `brief_id` | uuid | **FK → briefs(id)** cascade，not null |
| `user_id` | uuid | **FK → auth.users(id)** cascade，not null |
| `ticker` | text | not null |
| `score` | numeric | `check (between 0 and 10)` |
| `triggers` | jsonb | default `'[]'`（应用层形如 `{rule,desc,weight}[]`） |
| `rank` | int | |
| `created_at` | timestamptz | default now() |

- 索引：`stock_signals_brief_idx (brief_id)`。
- RLS（2 条 `auth.uid() = user_id`）：`select` / `insert`。

### `perspectives`（每简报每标的每人格）
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** |
| `brief_id` | uuid | **FK → briefs(id)** cascade，not null |
| `user_id` | uuid | **FK → auth.users(id)** cascade，not null |
| `ticker` | text | not null |
| `persona` | `persona_t` | not null |
| `stance` | `stance_t` | not null |
| `confidence` | numeric | `check (between 0 and 10)` |
| `summary` | text | |
| `cites` | jsonb | default `'[]'` |
| `created_at` | timestamptz | default now() |

- 索引：`perspectives_brief_ticker_idx (brief_id, ticker)`。
- RLS（2 条 `auth.uid() = user_id`）：`select` / `insert`。

### `news_items`（每用户缓存；v2 可能转共享）
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** |
| `user_id` | uuid | **FK → auth.users(id)** cascade，not null |
| `ticker` | text | not null |
| `title` | text | not null |
| `source` / `url` | text | |
| `sentiment` | numeric | |
| `published_at` | timestamptz | not null |
| `fetched_at` | timestamptz | default now() |

- 索引：`news_items_user_ticker_idx (user_id, ticker, published_at desc)`。
- RLS（2 条 `auth.uid() = user_id`）：`select` / `insert`。

### `broker_reports`
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK** |
| `user_id` | uuid | **FK → auth.users(id)** cascade，not null |
| `ticker` | text | not null |
| `broker` / `rating` / `target_price` | text | |
| `target_change_pct` | numeric | |
| `pdf_url` / `ai_summary` | text | |
| `published_at` | date | |
| `fetched_at` | timestamptz | default now() |

- 索引：`broker_reports_user_ticker_idx (user_id, ticker, published_at desc)`。
- RLS（2 条 `auth.uid() = user_id`）：`select` / `insert`。

### `user_preferences`
| 列 | 类型 | 约束 |
|---|---|---|
| `user_id` | uuid | **PK + FK → auth.users(id)** on delete cascade |
| `language` | text | default `'zh'` |
| `color_scheme` | text | default `'cn'`（`'cn'` 红涨 / `'us'` 绿涨） |
| `telegram_chat_id` | text | |
| `email_notifications` | boolean | default true |
| `daily_brief_time` | text | default `'08:30'` |
| `timezone` | text | default `'Asia/Shanghai'` |
| `updated_at` | timestamptz | default now() |

- RLS（3 条 `auth.uid() = user_id`）：`select` / `insert` / `update`。

### `profiles`（1:1 with auth.users，第二次迁移新增）
| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | **PK + FK → auth.users(id)** on delete cascade |
| `email` | text | |
| `display_name` | text | |
| `plan` | text | not null default `'free'`（free \| pro，Phase 2） |
| `role` | text | not null default `'user'`（user \| admin） |
| `usage` | jsonb | not null default `'{}'`（预留计数/限额） |
| `stripe_customer_id` | text | 预留 Phase 2 |
| `created_at` / `updated_at` | timestamptz | not null default now() |

- RLS（2 条，`auth.uid() = id`）：`profiles self read`（select）、`profiles self update`（update）。**客户端无 insert/delete**：行由触发器（security definer）创建、随 `auth.users` 级联删除。
- `plan`/`role` 在 Phase 1 自作用域可改；Phase 2 计划通过列授权或触发器锁死非客户端可写。

---

## 5. 注册触发器 `handle_new_user()`

`security definer set search_path = public`，语言 plpgsql。新用户插入 `auth.users` 后（`after insert ... for each row`）自动：

1. 建默认股票池：`watchlists(user_id, name='我的股票池', description='默认股票池', is_default=true)`。
2. 建偏好行：`user_preferences(user_id)`（全默认值）。
3. 建 profile：`profiles(id, email)`，`on conflict (id) do nothing`（第二次迁移扩展）。

触发器：`on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()`（两次迁移均防御性 `drop trigger if exists` 后重建）。

第二次迁移还回填存量用户：`insert into profiles (id, email) select u.id, u.email from auth.users u on conflict (id) do nothing`。

---

## 6. RLS 总览

- **公开读**：`stocks_universe`、`financial_history`（`using (true)`，仅 select）。
- **用户隔离**：所有用户表策略谓词为 `auth.uid() = user_id`（`user_preferences`/`profiles` 为 `= user_id`/`= id`），保证多租户数据库层硬隔离。
- **写权限差异**：`briefs` 允许 select/insert/delete（无 update，简报不可变）；`stock_signals`/`perspectives`/`news_items`/`broker_reports` 仅 select/insert（追加式产物）；`watchlists`/`watchlist_items`/`user_preferences` 提供完整 CRUD（后者无 delete，随 user 级联）。
- 总计约 **26 条 RLS 策略**（与 `AUTH_SETUP.md` 记录一致）。
