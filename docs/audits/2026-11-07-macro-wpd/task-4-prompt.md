You are Codex gpt-6-sol implementing ONE task of docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md in this worktree (branch claude/macro-wpd-cn, base = origin/main 68701c48 + the plan). READ FIRST: the "修订 A" section at the top of the plan (it overrides the task text where they conflict), the "仓库约定" section, and docs/audits/2026-11-07-macro-wpd/RECONCILE-2026-11-16.md. Rules: strict TDD (write the failing test, run it, implement, run again); this sandbox has no network and tests must never touch the network; do not edit any file listed in docs/audits/2026-11-07-macro-wpd/v2-closure.txt (formula-hash closure of macro_regime@v2 — includes types.ts, catalog.ts, regime.ts, decimal.ts); do not edit src/components, messages/*, or any page; do not commit (the commander commits); keep the compact code style of src/lib/macro; no banned words (概率, 置信度, probability, confidence). Fixtures: only the files in src/lib/macro/fixtures/cn-http/ (excerpts, see manifest.json) — the full raw responses are NOT in the repo and must not be fetched. Finish with: files changed, exact commands run with pass/fail counts, deviations from the task and why.

TASK: plan Task 4 (collector official_http branches in scripts/macro/collect.py + scripts/macro/test_collect.py). Overrides: A4 — the http_json / http_html branches are DORMANT: tests use stubs only (monkeypatch requests.Session.request / requests.adapters), there is NO dry-run step against real sites, and nothing may request a real host. Skip Step 5 of the task text. Run python tests with scripts/macro/.venv/bin/python -m pytest scripts/macro/test_collect.py -q. scripts/macro/cn-series.json must stay unchanged (exported from the catalog, which does not change in this PR); load_specs must accept both "cn-series/1" and "cn-series/2". collect_series must never raise SystemExit for an unknown function of ONE series: an unsupported function becomes that series' failed outcome with code "unsupported_function" so one bad spec cannot stop the whole collection (add a test). Also add the test for the per-host legacy-TLS adapter mentioned in the plan text (LEGACY_TLS_HOSTS contains only www.chinamoney.org.cn).

PLAN TEXT OF THE TASK (adapt per the overrides above; the overrides win):
### Task 4: 采集器 `official_http` 分支（`http_json` / `http_html`）

**Files:**
- Modify: `scripts/macro/collect.py`（`calls_for`、`collect_series`、`claims_from_frame` → 新 `claims_from_http`、`is_evidence`、`EXT`；顶部 `import ssl`、`import requests`、`import requests.adapters`；test_collect 加一例：`_http_get` 对 `www.chinamoney.org.cn` 挂 `_LegacyTlsAdapter`、对 `www.pbc.gov.cn` 不挂（monkeypatch `requests.Session.mount` 记录调用））
- Modify: `scripts/macro/test_collect.py`

说明：目录与 `cn-series.json` 本 PR 不动；本任务用测试里的本地 spec 字典验证分支。`cn-series.json` 的 `version` 仍为 `cn-series/1`；`load_specs` 同时接受 `cn-series/1` 与 `cn-series/2`（Task 10 导出 v2 后无需再改 Python）。

- [ ] **Step 1: 写失败测试**（追加到 `scripts/macro/test_collect.py`）

```python
LPR = {"series_id": "CN_LPR_1Y_Q", "function": "http_json", "fetch_host": "www.chinamoney.org.cn", "period": "day",
       "evidence_path": "/ags/ms/cm-u-bk-currency/LprHis", "evidence_path_match": "exact", "column": "1Y",
       "url": "https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate={start}&strEndDate={end}&pageNum=1&pageSize=50",
       "pointer": "/records", "field": "1Y", "windows": "calendar_year", "first_period": "2019-08-20"}
AFRE = {"series_id": "CN_AFRE_STOCK_YOY", "function": "http_html", "fetch_host": "www.pbc.gov.cn", "period": "month",
        "evidence_path": "/diaochatongjisi/attachDir/", "evidence_path_match": "prefix", "evidence_path_prefixes": ["/diaochatongjisi/attachDir/", "/diaochatongjisi/fileDir/resource/cms/"], "column": "增速（%）",
        "pages": [{"year": 2026, "url": "https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/shrzgm/index.html"},
                  {"year": 2025, "url": "https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5570903/5570885/index.html"}]}


def test_calls_for_http_json_uses_calendar_year_windows():
    today = dt.date(2026, 11, 7)
    daily = collect.calls_for(LPR, "daily", today)
    assert daily == [{"url": LPR["url"].format(start="2026-01-01", end="2026-12-31")}]
    back = collect.calls_for(LPR, "backfill", today)
    assert [c["url"][-70:] for c in back][0].count("2019-01-01") == 1 and len(back) == 8
    assert back[-1] == daily[0]


def test_calls_for_http_html_daily_first_page_backfill_all():
    today = dt.date(2026, 11, 7)
    assert collect.calls_for(AFRE, "daily", today) == [{"page": p["url"]} for p in AFRE["pages"][:2]]   # current + previous year (December lands in January; prior-year revisions)
    assert collect.calls_for(AFRE, "backfill", today) == [{"page": p["url"]} for p in AFRE["pages"]]


def test_is_evidence_prefixes_exact_and_content_type():
    cap = lambda url, ct="text/html", status=200: collect.Capture(method="GET", url=url, status=status, content_type=ct, body=b"", fetched_at="2026-11-07T00:00:00.000Z")
    assert collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/x.htm"))
    assert collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/fileDir/resource/cms/2016/02/x.htm"))   # 2015–2018 files
    assert not collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/shrzgm/index.html"))  # list pages are not evidence
    assert not collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/x.pdf"))
    assert not collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/x.htm", ct="application/json"))
    assert collect.is_evidence(LPR, cap("https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate=2026-01-01&strEndDate=2026-12-31&pageNum=1&pageSize=50", ct="application/json;charset=UTF-8"))
    assert not collect.is_evidence(LPR, cap("https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?x=1", ct="text/html"))
    assert not collect.is_evidence(LPR, cap("https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHisExcel", ct="application/json"))


def test_claims_from_http_json_is_non_fatal():
    body = json.dumps({"head": {"rep_code": "200"}, "data": {"message": ""}, "records": [
        {"1Y": "3.00", "5Y": "3.50", "showDateCN": "2026-10-20"}, {"1Y": "4.31", "5Y": "---", "showDateCN": "2019-08-01"}]}).encode("utf-8")
    assert collect.claims_from_http(LPR, body) == ([{"series_id": "CN_LPR_1Y_Q", "period_label": "2026-10-20", "value_text": "3.0"}], None)
    assert collect.claims_from_http({**LPR, "field": "5Y", "series_id": "CN_LPR_5Y_Q"}, body) == ([{"series_id": "CN_LPR_5Y_Q", "period_label": "2026-10-20", "value_text": "3.5"}], None)
    assert collect.claims_from_http(LPR, b"<html>") == ([], "claims_bad_json")   # evidence is kept; the TS parser decides
    assert collect.claims_from_http(LPR, json.dumps({"head": {"rep_code": "200"}, "data": {"message": "只提供一年历史数据查询及下载"}, "records": []}).encode()) == ([], "lpr_window_refused")


def test_discover_afre_htm_from_sub_page():
    page = ('<table class="a2015"><tr><td>社会融资规模增量统计表</td><td><a href="/diaochatongjisi/attachDir/a.htm">htm</a></td></tr></table>'
            '<table class="a2015"><tr><td>社会融资规模存量统计表<br>Aggregate Financing (Stock)</td><td><a href="/diaochatongjisi/attachDir/2026/10/b.htm">htm</a>'
            '<a href="/diaochatongjisi/attachDir/2026/10/b.pdf">pdf</a></td></tr></table>')
    utf8 = ('<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /></head>' + page).encode("utf-8")
    assert collect.discover_afre_htm("https://www.pbc.gov.cn", utf8) == "https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/b.htm"
    with pytest.raises(RuntimeError):
        collect.discover_afre_htm("https://www.pbc.gov.cn", b"<html><meta charset=utf-8></html>")
    with pytest.raises(RuntimeError):   # two stock blocks = ambiguous
        collect.discover_afre_htm("https://www.pbc.gov.cn", ('<meta charset=utf-8>' + page + page).encode("utf-8"))
    with pytest.raises(RuntimeError):   # undeclared / other charset is refused, never guessed
        collect.discover_afre_htm("https://www.pbc.gov.cn", ('<meta charset=gb2312>' + page).encode("gb2312"))


class _Resp:
    def __init__(self, url, body, ct, status=200):
        self.url, self.content, self.status_code, self.headers = url, body, status, {"content-type": ct}
    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


LIST_PAGE = '<meta charset=utf-8><table class="a2015"><tr><td>社会融资规模存量统计表</td><td><a href="/diaochatongjisi/attachDir/2026/10/b.htm">htm</a></td></tr></table>'.encode("utf-8")


def test_collect_series_http_html_records_only_the_htm(monkeypatch):
    import requests
    htm = "<html><meta charset=gb2312><table><tr><td>社会融资规模存量统计表</td></tr><tr><td>2026.1</td></tr></table></html>".encode("gb2312")
    calls = []
    def fake_request(self, method, url, *a, **k):
        calls.append((url, k.get("allow_redirects")))
        return _Resp(url, LIST_PAGE if url.endswith("index.html") else htm, "text/html")
    monkeypatch.setattr(requests.Session, "request", fake_request)
    r = collect.collect_series({**AFRE, "pages": AFRE["pages"][:1]}, "daily", dt.date(2026, 11, 7), ak=None)
    assert r["error"] is None and [c.url for c in r["evidence"]] == ["https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/b.htm"]
    assert len(r["captures"]) == 2 and r["claims"] == []   # html series carry no Python claims; the TS parser is the only reader
    assert all(ar is False for _, ar in calls)             # redirects are never followed


def test_collect_series_http_html_fails_but_keeps_evidence_when_the_table_is_not_the_stock_table(monkeypatch):
    import requests
    htm = "<html><meta charset=gb2312><table><tr><td>社会融资规模增量统计表</td></tr></table></html>".encode("gb2312")
    monkeypatch.setattr(requests.Session, "request", lambda self, m, url, *a, **k: _Resp(url, LIST_PAGE if url.endswith("index.html") else htm, "text/html"))
    r = collect.collect_series({**AFRE, "pages": AFRE["pages"][:1]}, "daily", dt.date(2026, 11, 7), ak=None)
    assert r["code"] == "afre_title_missing" and len(r["evidence"]) == 1


def test_collect_series_http_redirect_is_a_failure(monkeypatch):
    import requests
    monkeypatch.setattr(requests.Session, "request", lambda self, m, url, *a, **k: _Resp(url, b"", "text/html", status=302))
    r = collect.collect_series(LPR, "daily", dt.date(2026, 11, 7), ak=None)
    assert r["error"] is not None and r["evidence"] == []
```
并把既有 `test_committed_spec_file_lists_every_cn_series_once` 的两个集合改为 `<= {... , "http_json", "http_html"}` 与 `<= {..., "www.chinamoney.org.cn", "www.pbc.gov.cn"}`。

- [ ] **Step 2: 跑测试确认失败**

Run: `scripts/macro/.venv/bin/python -m pytest scripts/macro/test_collect.py -q`
Expected: 新用例 FAIL（`AttributeError: … claims_from_http` 等）。

- [ ] **Step 3: 实现**（`collect.py` 的变更点，逐段）

```python
# load_specs: 接受两个版本
    if doc.get("version") not in ("cn-series/1", "cn-series/2") or not isinstance(doc.get("series"), list):

# calls_for: 新增两个分支（放在 raise 之前）
    if fn == "http_json":
        if spec.get("windows") != "calendar_year":
            raise SystemExit(f"{spec['series_id']}: unsupported windows {spec.get('windows')!r}")
        first = _dt.date.fromisoformat(spec["first_period"])
        years = range(first.year, today.year + 1) if mode == "backfill" else [today.year]
        return [{"url": spec["url"].format(start=f"{y}-01-01", end=f"{y}-12-31")} for y in years]
    if fn == "http_html":
        pages = spec["pages"] if mode == "backfill" else spec["pages"][:1]
        return [{"page": p["url"]} for p in pages]

# is_evidence: 支持 prefix 列表 + Content-Type 家族（http_json → application/json；http_html → text/html）
CT_FAMILY = {"http_json": "application/json", "http_html": "text/html"}

def is_evidence(spec, cap):
    parts = urlsplit(cap.url)
    if cap.status != 200 or parts.scheme != "https" or parts.hostname != spec["fetch_host"]:
        return False
    fam = CT_FAMILY.get(spec["function"])
    if fam and not cap.content_type.lower().startswith(fam):
        return False
    if spec.get("evidence_path_match") == "prefix":
        prefixes = spec.get("evidence_path_prefixes") or [spec["evidence_path"]]
        return parts.path.endswith(".htm") and any(parts.path.startswith(p) for p in prefixes)
    return parts.path == spec["evidence_path"]

# claims（http_json 只用 JSON 字段做交叉核对；失败不致命：返回 (claims, code)；http_html 无 claim）
def claims_from_http(spec, body: bytes):
    if spec["function"] != "http_json":
        return [], None
    try:
        doc = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return [], "claims_bad_json"
    data = doc.get("data") if isinstance(doc, dict) else None
    if isinstance(data, dict) and data.get("message"):
        return [], "lpr_window_refused"
    out = []
    for rec in _json_pointer(doc, spec["pointer"]) or []:
        if not isinstance(rec, dict):
            continue
        d = rec.get("showDateCN")
        if not isinstance(d, str) or d < spec["first_period"]:
            continue
        vt = value_text(rec.get(spec["field"]))
        if vt is not None:
            out.append({"series_id": spec["series_id"], "period_label": d, "value_text": vt})
    return out, None

def _json_pointer(doc, pointer: str):
    cur = doc
    for part in pointer.split("/")[1:]:
        cur = cur[int(part)] if isinstance(cur, list) else cur.get(part)
        if cur is None:
            return None
    return cur

# 列表页解码 + 发现 htm（只认标题恰为 社会融资规模存量统计表 的 a2015 表块；0 或 >1 块 = 错误）
def _page_text(page: bytes) -> str:
    """PBOC list pages declare charset=utf-8 (verified 2026-11-07); any other declaration is refused, never guessed."""
    head = page[:2048].decode("latin-1")
    m = re.search(r"charset=([\w-]+)", head, re.I)
    if not m or m.group(1).lower() != "utf-8":
        raise RuntimeError(f"unexpected charset {m.group(1) if m else 'none'}")
    return page.decode("utf-8")


def discover_afre_htm(base: str, page: bytes) -> str:
    text = _page_text(page)
    blocks = [b for b in re.findall(r'<table[^>]*class="a2015"[^>]*>.*?</table>', text, re.S)
              if "社会融资规模存量统计表" in re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", b))]
    if len(blocks) != 1:
        raise RuntimeError(f"{len(blocks)} stock-table blocks on the AFRE page")
    m = re.search(r'href=["\']([^"\']+\.htm)["\']', blocks[0])
    if not m:
        raise RuntimeError("no htm link in the stock-table block")
    return base + m.group(1)


class ClaimsUnavailable(RuntimeError):
    """Evidence was received but is not usable as claimed; str(e) is the series outcome code."""


LEGACY_TLS_HOSTS = {"www.chinamoney.org.cn"}   # server requires legacy renegotiation (verified 2026-11-07); OpenSSL 3 refuses by default


class _LegacyTlsAdapter(requests.adapters.HTTPAdapter):
    """OP_LEGACY_SERVER_CONNECT for one host only; everything else keeps the default context."""
    def init_poolmanager(self, *a, **k):
        ctx = ssl.create_default_context()
        ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT
        k["ssl_context"] = ctx
        return super().init_poolmanager(*a, **k)


def _http_get(url: str, host: str):
    """Official-host GET: https, exact host, redirects are failures (3xx raises), 4xx/5xx raise. requests.Session.request is what
    recorder.recording() wraps, so these responses are captured like AKShare's."""
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != host:
        raise RuntimeError(f"refused url {url}")
    s = requests.Session()
    if host in LEGACY_TLS_HOSTS:
        s.mount(f"https://{host}/", _LegacyTlsAdapter())
    res = s.get(url, headers={"user-agent": UA, "accept": "application/json,text/html;q=0.9"}, timeout=60, allow_redirects=False)
    if 300 <= res.status_code < 400:
        raise RuntimeError(f"redirect {res.status_code} from {url}")
    res.raise_for_status()
    return res


# collect_series: fn 解析改为按 function 分派（AKShare 函数仍走 getattr(ak, …)，只在非 http_* 时取；ak 可为 None）
    host = spec["fetch_host"]
    for kwargs in calls_for(spec, mode, today):
        got: List[Capture] = []
        try:
            with recording() as got:                      # the ONLY place captures are collected (appended once, in finally)
                if spec["function"] == "http_json":
                    res = _http_get(kwargs["url"], host)
                    found, code = claims_from_http(spec, res.content)
                    if code:                              # evidence stays in `got`; the series is reported failed with the code
                        raise ClaimsUnavailable(code)
                    claims.extend(found)
                elif spec["function"] == "http_html":
                    page = _http_get(kwargs["page"], host)
                    htm = _http_get(discover_afre_htm(f"https://{host}", page.content), host)
                    if "社会融资规模存量统计表".encode("gb2312") not in htm.content:   # structural check; the TS parser is still the only reader
                        raise ClaimsUnavailable("afre_title_missing")
                else:
                    df = fn(**kwargs)
                    claims.extend(claims_from_frame(spec, df, today))
        finally:
            caps.extend(got); evidence.extend(c for c in got if is_evidence(spec, c))
    ...
    if not claims and spec["function"] != "http_html":
        raise EmptySeries(...)
    # except: code = str(e) if isinstance(e, ClaimsUnavailable) else ("empty_series" if EmptySeries else f"collect_{type}")
```
`UA = "OsbornAlpha-macro-collect/1 (+https://osbornalpha.com)"` 常量。版本修订语义（社融）：每年一个文件、每月换新文件名；采集顺序 = `available_at`（`availability_basis='first_seen'` 既有规则），同期新值经 `macro_write_observations` 对 `revisable` 行写新版本；文件名中的发布日期（`attachDir/2026/10/2026101417…`）不作为版本键，只在 runbook §10 记录为核实信息。`EXT` 已含 `text/html` → `.html`；录制夹具名后缀对 htm 评价用 `html` 即可。`verification()` 的 `_numbers_in` 对 html 走既有 `>…<` 正则，gb2312 字节用 `errors="replace"` 解码后数字仍可定位。

- [ ] **Step 4: 测试通过**

Run: `scripts/macro/.venv/bin/python -m pytest scripts/macro/test_collect.py -q`
Expected: 全部 PASS。

- [ ] **Step 5: 真实 dry-run 核对（不发任何请求到 ingest）**

Run（临时 spec 文件，不提交）：
```bash
cat > /tmp/wpd-specs.json <<'EOF'
{"version":"cn-series/2","series":[ <LPR 与 AFRE 两个 spec 字典，同测试> ]}
EOF
scripts/macro/.venv/bin/python scripts/macro/collect.py --mode daily --dry-run /tmp/wpd-dry --spec /tmp/wpd-specs.json
```
（`--spec` 为本任务新增的可选参数，默认 `cn-series.json`。）
Expected: `/tmp/wpd-dry/chunk-0.json` 含两条 evidence（LprHis 2026 窗口 JSON、2026 年存量 htm），`claims` 只有 LPR；`finish` 的 `series_outcomes` 两个 `ok:true`。把 evidence 的 `sha256` 与 Task 1 夹具 manifest 对比（LPR 2026 窗口与当日录制若无新报价应相同；AFRE 若 PBOC 已换月文件则不同——记录在实施日志）。

- [ ] **Step 6: 提交**

```bash
git add scripts/macro/collect.py scripts/macro/test_collect.py
git commit -F - <<'EOF'
feat(macro): collector official_http branch (http_json calendar-year windows, http_html AFRE discovery, --spec)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

