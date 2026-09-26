# 实体对照表设计（WP-A2） / Entity keys design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§5.2、§8.2 WP-A2、§13 候选名单。用户已确认：先录入 §13 全部 21 家并加 `in_scope` 标记，名单到后再圈定 12–15 家；采用两张新表（公司键 + 证券键）；授权下载 SEC `company_tickers.json` 与 GLEIF ISIN↔LEI 映射文件到会话临时目录用于取键。设计已批准。

## 目标 / Goal

给每家公司一行"公司键"（LEI、USCI、cninfo orgId、CIK、中英文名、别名）和一到多行"证券键"（交易所代码、ISIN、市场、有效期），每个键要么有值并带来源，要么明确标缺；提供 `entityTableVersion()` 内容哈希供 A3 判断快照引用；提供 GLEIF/SEC 解析脚本与 A 股手工模板；首批 21 家数据随仓库提交并可幂等写库。

## 非目标 / Non-goals

- 不做别名→实体自动对齐（A5），不做采集器（A4）。
- 不改 `research_entities` 的列，只加 `(user_id,id)` 唯一索引供复合外键。
- 不把 GLEIF/SEC 原始文件提交进仓库；仓库只含解析结果。
- 不接触生产库。

## 数据 / Schema `supabase/migrations/20260926010000_research_entity_keys.sql`

```sql
create unique index if not exists research_entities_owner_id on public.research_entities(user_id,id);

create table if not exists public.research_entity_keys (
  user_id        uuid not null references auth.users(id) on delete cascade,
  entity_id      uuid not null,
  lei            text check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$'),
  usci           text check (usci is null or usci ~ '^[0-9A-HJ-NP-RTUW-Y]{18}$'),
  cninfo_org_id  text check (cninfo_org_id is null or length(btrim(cninfo_org_id)) > 0),
  cik            text check (cik is null or cik ~ '^[0-9]{1,10}$'),
  names_zh       jsonb not null default '[]',
  names_en       jsonb not null default '[]',
  aliases        jsonb not null default '[]',
  home_market    text not null check (home_market in ('A','HK','US','other')),
  in_scope       boolean not null default false,
  cohort         text,
  provenance     jsonb not null default '{}',   -- {lei:{source,retrieved_at,ref}, usci:{...}, ...}
  missing        jsonb not null default '[]',   -- 明确标缺的键名
  updated_at     timestamptz not null default now(),
  primary key (user_id,entity_id),
  foreign key (user_id,entity_id) references public.research_entities(user_id,id) on delete cascade
);
create unique index if not exists research_entity_keys_lei_idx on public.research_entity_keys(user_id,lei) where lei is not null;
create unique index if not exists research_entity_keys_usci_idx on public.research_entity_keys(user_id,usci) where usci is not null;
create unique index if not exists research_entity_keys_cik_idx on public.research_entity_keys(user_id,cik) where cik is not null;

create table if not exists public.research_entity_securities (
  user_id        uuid not null references auth.users(id) on delete cascade,
  id             uuid not null,
  entity_id      uuid not null,
  exchange_code  text not null check (exchange_code ~ '^[A-Z0-9.\-]{1,20}$'),   -- 600570.SH / 0268.HK / PLTR
  mic            text check (mic is null or mic ~ '^[A-Z0-9]{4}$'),           -- XSHG / XSHE / XHKG / XNYS / XNAS
  isin           text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  market         text not null check (market in ('A','HK','US','other')),
  security_type  text not null default 'common' check (security_type in ('common','adr','preferred','other')),
  is_primary     boolean not null default true,
  valid_from     date not null,
  valid_to       date check (valid_to is null or valid_to > valid_from),
  provenance     jsonb not null default '{}',
  primary key (user_id,id),
  foreign key (user_id,entity_id) references public.research_entities(user_id,id) on delete cascade
);
create unique index if not exists research_entity_securities_code_idx on public.research_entity_securities(user_id,exchange_code,valid_from);
create unique index if not exists research_entity_securities_isin_idx on public.research_entity_securities(user_id,isin,valid_from) where isin is not null;
create index if not exists research_entity_securities_entity_idx on public.research_entity_securities(user_id,entity_id);
```

RLS：沿 Research OS 惯例给 `authenticated` 建 self select/insert/update/delete 四条策略（对照表是可修订的主数据，不是只追加台账）；`alpha_s4_runtime` 只授 select（A6 的 fan-out 需读）。ISIN/LEI/USCI 的校验位由代码校验，数据库只约束形状。

## 代码 / Code `src/lib/research/entity-keys/`

- `identifiers.ts`：`isValidIsin`（ISO 6166 Luhn）、`isValidLei`（ISO 17442 mod 97-10）、`isValidUsci`（GB 32100 加权模 31）、`isValidCik`、`normalizeCik`（去前导零，存为无前导零字串）。纯函数。
- `parsers.ts`：`parseSecCompanyTickers(json, tickers[])` → `{ticker → {cik, title}}`；`selectIsinsForLeis(csvLines: Iterable<string>, leis: Set<string>)` → `{lei → isin[]}`（流式逐行，不整文件入内存）。纯函数，测试用小 fixture。
- `first-cohort.json`：21 家的公司键与证券键，每个键带 `provenance`（`source` ∈ `gleif-api | gleif-isin-lei-file | sec-company-tickers | web:<domain> | manual`，`retrieved_at`，`ref`）；缺键列入 `missing`。`in_scope: true`，`cohort: 'candidate-2026-09'`（用户名单到后改标记）。
- `cohort.test.ts`：加载 JSON，逐家校验：名称非空、`home_market` 合法、至少一条 `is_primary` 证券且 `valid_from` 存在、每个非空 ISIN/LEI/USCI/CIK 校验位正确、`missing` 与空键一致（空键必在 `missing`，有值键必不在）、同一键值不重复。
- `store.ts`：`upsertEntityKeys(ctx, company)`（先 `upsertEntity(type COMPANY)` 得 `entity_id`，再 upsert 键行与证券行，证券以 `(exchange_code, valid_from)` 为键）、`listEntityKeys(ctx)`、`entityTableVersion(ctx)`（取全部键行与证券行，去掉 `updated_at`/`provenance`，按 `entity_id`/`exchange_code,valid_from` 排序后 `digest`，返回 64 位十六进制）。用 Supabase 客户端（与 `entities.ts` 一致），mock 测试 + 真库集成测试。
- `seed.ts`：`seedEntityKeys(ctx)` 读 `first-cohort.json` 逐家 `upsertEntityKeys`；幂等。

## 脚本与模板 / Scripts and template

- `scripts/entity-keys/parse-sec-tickers.ts <company_tickers.json> <TICKER…>`：打印 `ticker,cik,title`。
- `scripts/entity-keys/parse-gleif-isin-lei.ts <lei-isin.csv> <LEI…>`：流式打印 `lei,isin`。
- `scripts/entity-keys/seed.ts`：`RESEARCH_OWNER_USER_ID=<uuid> npx tsx scripts/entity-keys/seed.ts`，写库后打印 `entityTableVersion`。
- `docs/templates/entity-keys-a-share-manual.csv`：列 `exchange_code,name_zh,usci,cninfo_org_id,source_url,checked_by,checked_at`，预填 10 家 A 股的代码与已知 USCI，`cninfo_org_id` 留空待人工。

## 首批数据来源 / First-cohort provenance

- CIK：SEC `company_tickers.json`（2026-09-25 下载）。9/9。
- LEI：GLEIF LEI API（`filter[fulltext]` / `filter[entity.legalName]`）。17/21；缺 财富趋势、长亮科技、宇信科技、京北方（GLEIF 无记录，标缺）。港股两家取上市主体（Bairong Inc.、Kingdee International Software Group Company Limited，均 KY 注册，LEI 状态 LAPSED 如实记录）。
- ISIN：美股 9 家与百融云来自 GLEIF ISIN↔LEI 文件（按 LEI 过滤，取普通股 ISIN）；A 股 10 家与金蝶来自公开行情页检索（`web:<domain>`），全部通过校验位。
- USCI：GLEIF `registeredAs`（6 家）+ 公开企业信息检索（4 家），10/10 通过校验位。
- cninfo orgId：10 家全部标缺，待手工模板。

## 验收 / Acceptance

`npm test`（含真库集成：迁移可重放、RLS 策略、复合外键、唯一索引、`entityTableVersion` 对同数据稳定且改一键即变）、`npm run typecheck`、`npm run lint`、`npm run build` 通过；Codex CLI（中等）评审无 P1；不接触生产库。
