"""scripts/macro/test_collect.py — offline tests for recorder.py and collect.py (no network).

Run: scripts/macro/.venv/bin/python -m pytest scripts/macro -q
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

import curl_cffi.requests as curl
import pandas as pd
import pytest
import requests

import collect
from recorder import Capture, recording

HERE = Path(__file__).resolve().parent


# ---------------------------------------------------------------- recorder
class FakeCurlResponse:
    def __init__(self, url: str, body: bytes, status: int = 200, ct: str = "application/json;charset=UTF-8"):
        self.url, self.content, self.status_code, self.headers = url, body, status, {"content-type": ct}


def fake_requests_response(url: str, body: bytes, status: int = 200, ct: str = "text/html;charset=UTF-8") -> requests.Response:
    r = requests.Response()
    r.url, r.status_code, r._content = url, status, body
    r.headers["content-type"] = ct
    return r


@pytest.fixture
def fake_transport(monkeypatch):
    """Replaces both HTTP layers with in-memory fakes; the recorder then wraps the fakes."""
    seen = []

    def fake_requests(self, method, url, *a, **k):
        seen.append(("requests", method, url))
        if "boom" in url:
            raise requests.ConnectionError("boom")
        return fake_requests_response(url + "?final=1", f"<table><tr><td>{url}</td></tr></table>".encode())

    def fake_curl(self, method, url, *a, **k):
        seen.append(("curl", method, url))
        return FakeCurlResponse(url, b'{"data":[],"success":true}')

    monkeypatch.setattr(requests.Session, "request", fake_requests)
    monkeypatch.setattr(curl.Session, "request", fake_curl)
    return seen, fake_requests, fake_curl


def test_recorder_captures_both_http_layers_without_altering_responses(fake_transport):
    seen, fake_requests, fake_curl = fake_transport
    with recording() as caps:
        r1 = requests.get("https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery")
        r2 = curl.Session().post("https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData", json={"a": 1})
    assert r1.text.startswith("<table>") and r1.url.endswith("?final=1")
    assert r2.content == b'{"data":[],"success":true}'
    assert [(c.method, c.status) for c in caps] == [("GET", 200), ("POST", 200)]
    assert caps[0].url == "https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery?final=1"   # final URL
    assert caps[0].content_type == "text/html;charset=UTF-8" and caps[0].body == r1.content
    assert caps[1].sha256 == hashlib.sha256(b'{"data":[],"success":true}').hexdigest()
    assert caps[0].fetched_at.endswith("Z") and dt.datetime.fromisoformat(caps[0].fetched_at.replace("Z", "+00:00"))
    assert requests.Session.request is fake_requests and curl.Session.request is fake_curl   # restored


def test_recorder_lets_errors_propagate_and_restores_on_exception(fake_transport):
    _, fake_requests, fake_curl = fake_transport
    with pytest.raises(requests.ConnectionError):
        with recording() as caps:
            requests.get("https://boom.example/")
    assert caps == []
    assert requests.Session.request is fake_requests and curl.Session.request is fake_curl


def test_recorder_does_not_capture_outside_the_block(fake_transport):
    with recording() as caps:
        pass
    requests.get("https://www.safe.gov.cn/x")
    assert caps == []


# ---------------------------------------------------------------- specs and calls
NBS = {"series_id": "CN_PMI_MFG", "function": "macro_china_nbs_nation", "fetch_host": "data.stats.gov.cn", "period": "month",
       "evidence_path": "/dg/website/publicrelease/web/external/stream/esData", "column": "制造业采购经理指数(%)", "kind": "月度数据",
       "path": "采购经理指数 > 制造业采购经理指数", "daily_period": "LAST13", "backfill": [{"path": "采购经理指数 > 制造业采购经理指数", "period": "2016-"}]}
BOND = {"series_id": "CN_CGB_10Y_D", "function": "bond_china_yield", "fetch_host": "yield.chinabond.com.cn", "period": "day",
        "evidence_path": "/cbweb-pbc-web/pbc/historyQuery", "curve": "中债国债收益率曲线", "column": "10年", "window_days": 45, "backfill_from": "2016-01-01"}
SAFE = {"series_id": "CN_USDCNY_CP_D", "function": "currency_boc_safe", "fetch_host": "www.safe.gov.cn", "period": "day",
        "evidence_path": "/AppStructured/hlw/RMBQuery.do", "column": "美元"}


def test_committed_spec_file_lists_every_cn_series_once():
    specs = collect.load_specs()
    ids = [s["series_id"] for s in specs]
    assert len(ids) == len(set(ids)) and all(i.startswith("CN_") for i in ids)
    assert {s["function"] for s in specs} <= {"macro_china_nbs_nation", "bond_china_yield", "currency_boc_safe"}
    assert {s["fetch_host"] for s in specs} <= {"data.stats.gov.cn", "yield.chinabond.com.cn", "www.safe.gov.cn"}


def test_calls_for_daily_and_backfill():
    today = dt.date(2026, 11, 6)
    assert collect.calls_for(NBS, "daily", today) == [{"kind": "月度数据", "path": "采购经理指数 > 制造业采购经理指数", "period": "LAST13"}]
    assert collect.calls_for(NBS, "backfill", today) == [{"kind": "月度数据", "path": "采购经理指数 > 制造业采购经理指数", "period": "2016-"}]
    assert collect.calls_for(BOND, "daily", today) == [{"start_date": "20260922", "end_date": "20261106"}]
    windows = collect.calls_for(BOND, "backfill", today)
    assert windows[0] == {"start_date": "20160101", "end_date": "20161231"} and windows[-1] == {"start_date": "20260101", "end_date": "20261106"}
    assert len(windows) == 11
    assert collect.calls_for(SAFE, "daily", today) == [{}]


def test_is_evidence_requires_https_host_path_and_200():
    cap = lambda url, status=200: Capture("POST", url, status, "application/json", b"{}", "2026-11-06T00:00:00.000Z")
    assert collect.is_evidence(NBS, cap("https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData"))
    assert not collect.is_evidence(NBS, cap("https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndexTreeAsync?pid=&code=1"))
    assert not collect.is_evidence(NBS, cap("https://evil.example/dg/website/publicrelease/web/external/stream/esData"))
    assert not collect.is_evidence(NBS, cap("http://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData"))
    assert not collect.is_evidence(NBS, cap("https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData", 500))


# ---------------------------------------------------------------- claims
def test_value_text_is_shortest_round_trip_and_skips_nan():
    assert collect.value_text(49.3) == "49.3" and collect.value_text(7.2) == "7.2" and collect.value_text(105.0) == "105.0"
    assert collect.value_text(1.6038) == "1.6038" and collect.value_text(760836431.0) == "760836431.0"
    assert collect.value_text(float("nan")) is None and collect.value_text(None) is None and collect.value_text("x") is None


def test_claims_from_nbs_frame_matches_label_ignoring_spaces_and_underscores():
    df = pd.DataFrame({"2026年10月": [math.nan, 1.0], "2026年9月": [7.2, 2.0]}, index=["货币和准货币(M2)供应量__同比增长(%)", "货币(M1)供应量__同比增长(%)"])
    spec = {**NBS, "series_id": "CN_M2_YOY", "column": "货币和准货币(M2)供应量_同比增长(%)"}
    assert collect.claims_from_frame(spec, df) == [{"series_id": "CN_M2_YOY", "period_label": "2026年9月", "value_text": "7.2"}]
    with pytest.raises(ValueError):
        collect.claims_from_frame({**spec, "column": "不存在"}, df)


def test_claims_from_bond_frame_keep_only_the_curve():
    df = pd.DataFrame({"曲线名称": ["中债国债收益率曲线", "中债中短期票据收益率曲线(AAA)"], "日期": [dt.date(2026, 11, 5)] * 2, "10年": [1.6038, 1.9135]})
    assert collect.claims_from_frame(BOND, df) == [{"series_id": "CN_CGB_10Y_D", "period_label": "2026-11-05", "value_text": "1.6038"}]


def test_claims_from_safe_frame_skip_old_history():
    old = dt.date.today() - dt.timedelta(days=900)
    df = pd.DataFrame({"日期": [old, dt.date.today()], "美元": [710.0, 671.56]})
    assert collect.claims_from_frame(SAFE, df) == [{"series_id": "CN_USDCNY_CP_D", "period_label": str(dt.date.today()), "value_text": "671.56"}]


# ---------------------------------------------------------------- chunks and bodies
def _item(sid: str, size: int, n: int):
    body = bytes([n % 256]) * size
    return {"series_id": sid, "sha256": hashlib.sha256(body).hexdigest(), "url": "https://data.stats.gov.cn/x", "status": 200,
            "content_type": "application/json", "fetched_at": "2026-11-06T00:00:00.000Z", "bytes_b64": base64.b64encode(body).decode()}


def test_pack_chunks_respects_the_limit_and_keeps_claims_with_their_evidence():
    items = [_item("CN_A", 40_000, i) for i in range(5)] + [_item("CN_B", 10_000, 9)]
    claims = {"CN_A": [{"series_id": "CN_A", "period_label": "2026年9月", "value_text": "1"}], "CN_B": [{"series_id": "CN_B", "period_label": "2026-11-05", "value_text": "2"}]}
    chunks = collect.pack_chunks("b", items, claims, limit=120_000)
    assert all(len(json.dumps(c, separators=(",", ":")).encode()) <= 120_000 for c in chunks)
    assert [c["seq"] for c in chunks] == list(range(len(chunks))) and {c["total"] for c in chunks} == {len(chunks)}
    assert sorted(e["sha256"] for c in chunks for e in c["evidence"]) == sorted(i["sha256"] for i in items)
    for c in chunks:
        assert {cl["series_id"] for cl in c["claims"]} == {e["series_id"] for e in c["evidence"]}
    with pytest.raises(ValueError):
        collect.pack_chunks("b", [_item("CN_A", 200_000, 1)], {}, limit=120_000)


def test_build_bodies_follow_the_three_action_protocol():
    cap = Capture("POST", "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData", 200, "application/json;charset=UTF-8",
                  b'{"data":[],"success":true}', "2026-11-06T05:00:00.000Z")
    results = [{"series_id": "CN_PMI_MFG", "captures": [cap], "evidence": [cap], "claims": [{"series_id": "CN_PMI_MFG", "period_label": "2026年10月", "value_text": "49.3"}], "error": None}]
    failed = {"series_id": "CN_M2_YOY", "captures": [], "evidence": [], "claims": [], "error": "RuntimeError: site down", "code": "collect_runtimeerror"}
    start, chunks, finish = collect.build_bodies(results + [failed], "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-0000000000aa", {"akshare": "1.20.35"})
    assert start == {"action": "start", "tool_versions": {"akshare": "1.20.35"}}
    assert collect.build_bodies(results, "B", "T", {"a": "1"}, takeover=True)[0] == {"action": "start", "tool_versions": {"a": "1"}, "takeover": True}
    assert finish == {"action": "finish", "batch_id": "00000000-0000-4000-8000-000000000001", "owner_token": "00000000-0000-4000-8000-0000000000aa", "total": 1,
                      "series_outcomes": [{"series_id": "CN_PMI_MFG", "ok": True}, {"series_id": "CN_M2_YOY", "ok": False, "code": "collect_runtimeerror"}]}
    (c,) = chunks
    assert set(c) == {"action", "batch_id", "owner_token", "seq", "total", "evidence", "claims"} and c["action"] == "chunk"
    assert c["owner_token"] == "00000000-0000-4000-8000-0000000000aa"
    (e,) = c["evidence"]
    assert set(e) == {"series_id", "sha256", "url", "status", "content_type", "fetched_at", "bytes_b64"}
    assert base64.b64decode(e["bytes_b64"]) == cap.body and e["sha256"] == hashlib.sha256(cap.body).hexdigest()


def test_send_posts_start_chunks_finish_in_order():
    cap = Capture("GET", "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do", 200, "text/html", b"<table></table>", "2026-11-06T05:00:00.000Z")
    posted = []

    def post(body):
        posted.append(body["action"])
        assert body["action"] == "start" or body["owner_token"] == "T"   # every later body carries the owner token (P1-3)
        return {"batch_id": "B", "owner_token": "T"} if body["action"] == "start" else {"ok": True}
    out = collect.send([{"series_id": "CN_USDCNY_CP_D", "captures": [cap], "evidence": [cap], "claims": [], "error": None}], post, {"akshare": "1.20.35"})
    assert posted == ["start", "chunk", "finish"] and out["batch_id"] == "B" and out["chunks"] == 1 and out["restarts"] == []


def test_send_reports_failed_series_and_finishes_even_without_chunks():
    bodies = []

    def post(body):
        bodies.append(body)
        return {"batch_id": "B", "owner_token": "T"} if body["action"] == "start" else {"ok": True}
    collect.send([{"series_id": "CN_M2_YOY", "captures": [], "evidence": [], "claims": [], "error": "ValueError: x", "code": "collect_valueerror"}], post, {"akshare": "1.20.35"})
    assert [b["action"] for b in bodies] == ["start", "finish"]
    assert bodies[-1] == {"action": "finish", "batch_id": "B", "owner_token": "T", "total": 0, "series_outcomes": [{"series_id": "CN_M2_YOY", "ok": False, "code": "collect_valueerror"}]}


def _scripted(monkeypatch, chunk_reply):
    """send() over two fixed chunks per batch; chunk_reply(batch_id, seq) returns a payload or raises IngestHttpError."""
    monkeypatch.setattr(collect, "build_bodies", lambda results, b, t, v, takeover=False: (
        {"action": "start", "tool_versions": v, **({"takeover": True} if takeover else {})},
        [{"action": "chunk", "batch_id": b, "owner_token": t, "seq": i, "total": 2, "evidence": [], "claims": []} for i in range(2)],
        {"action": "finish", "batch_id": b, "owner_token": t, "total": 2, "series_outcomes": []}))
    log, starts = [], iter([{"batch_id": "B1", "owner_token": "T1"}, {"batch_id": "B2", "owner_token": "T2"}, {"batch_id": "B3", "owner_token": "T3"}])

    def post(body):
        log.append((body["action"], body.get("batch_id"), body.get("seq"), body.get("takeover", False)))
        if body["action"] == "start":
            return next(starts)
        return chunk_reply(body["batch_id"], body["seq"]) if body["action"] == "chunk" else {"batch_id": body["batch_id"], "status": "success"}
    return post, log


def test_send_restarts_under_a_new_batch_when_a_chunk_stays_processing(monkeypatch):
    def reply(batch_id, seq):
        if batch_id == "B1" and seq == 1:
            raise collect.IngestHttpError("chunk", 409, "chunk_in_progress")   # a crashed request left it 'processing' (P2-1)
        return {"status": "accepted"}
    post, log = _scripted(monkeypatch, reply)
    sleeps = []
    out = collect.send([], post, {"a": "1"}, sleep=sleeps.append, chunk_retries=2)
    assert out["batch_id"] == "B2" and out["restarts"] == [{"batch_id": "B1", "reason": "chunk_stalled"}]
    assert [e for e in log if e[0] == "chunk"] == [("chunk", "B1", 0, False), ("chunk", "B1", 1, False), ("chunk", "B1", 1, False), ("chunk", "B1", 1, False),
                                                   ("chunk", "B2", 0, False), ("chunk", "B2", 1, False)]   # the old batch's chunks are never replayed
    assert ("start", None, None, True) in log and log[-1] == ("finish", "B2", None, False)
    assert sleeps == [1, 2]


def test_send_restarts_once_on_fenced_and_gives_up_on_a_second_fence(monkeypatch):
    def reply(batch_id, seq):
        if seq == 1:
            raise collect.IngestHttpError("chunk", 409, "fenced")             # every batch fenced: someone else owns the dataset
        return {"status": "accepted"}
    post, log = _scripted(monkeypatch, reply)
    with pytest.raises(RuntimeError, match="failed after 2 attempts"):
        collect.send([], post, {"a": "1"}, sleep=lambda s: None)
    assert [e[1] for e in log if e[0] == "start"] == [None, None]
    assert [e for e in log if e[0] == "start"][1][3] is True                    # the restart asks for a takeover
    assert not any(e[0] == "finish" for e in log)


def test_takeover_start_polls_while_the_stalled_run_is_younger_than_the_server_timeout(monkeypatch):
    calls = []

    def post(body):
        calls.append(body)
        if body.get("takeover") and len([c for c in calls if c.get("takeover")]) < 3:
            raise collect.IngestHttpError("start", 409, "batch_running")
        return {"batch_id": "B", "owner_token": "T"}
    sleeps = []
    assert collect._start(post, {"a": "1"}, takeover=True, sleep=sleeps.append, polls=5, poll_s=60.0) == {"batch_id": "B", "owner_token": "T"}
    assert sleeps == [60.0, 60.0]
    with pytest.raises(collect.IngestHttpError):
        collect._start(lambda b: (_ for _ in ()).throw(collect.IngestHttpError("start", 409, "batch_running")), {"a": "1"}, takeover=False, sleep=sleeps.append, polls=5, poll_s=60.0)


def test_collect_series_records_errors_without_raising(monkeypatch):
    class FakeAk:
        @staticmethod
        def currency_boc_safe():
            raise RuntimeError("site down")
    r = collect.collect_series(SAFE, "daily", dt.date(2026, 11, 6), FakeAk)
    assert r["error"].startswith("RuntimeError: site down") and r["evidence"] == [] and r["code"] == "collect_runtimeerror"


def test_collect_series_keeps_only_evidence_responses(fake_transport):
    class FakeAk:
        @staticmethod
        def currency_boc_safe():
            requests.get("https://www.safe.gov.cn/safe/2020/1218/17833.html")
            requests.post("https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do")
            return pd.DataFrame({"日期": [dt.date.today()], "美元": [671.56]})
    r = collect.collect_series({**SAFE, "evidence_path": "/AppStructured/hlw/RMBQuery.do"}, "daily", dt.date.today(), FakeAk)
    # the fake transport appends ?final=1 to the URL but keeps the path, so only the RMBQuery.do response is evidence
    assert r["error"] is None and [c.url.split("?")[0] for c in r["evidence"]] == ["https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do"]
    assert len(r["captures"]) == 2 and r["claims"][0]["value_text"] == "671.56"


def test_dry_run_writes_bodies_and_sends_nothing(tmp_path, monkeypatch):
    cap = Capture("POST", "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData", 200, "application/json", b'{"data":[]}', "2026-11-06T05:00:00.000Z")
    monkeypatch.setattr(collect, "collect_series", lambda spec, mode, today, ak: {"series_id": spec["series_id"], "captures": [cap], "evidence": [cap], "claims": [], "error": None})
    monkeypatch.setattr(collect, "tool_versions", lambda: {"akshare": "test"})
    monkeypatch.setattr(collect, "http_poster", lambda *a, **k: pytest.fail("dry run must not post"))
    monkeypatch.delenv("MACRO_INGEST_URL", raising=False)
    assert collect.main(["--series", "CN_PMI_MFG", "--dry-run", str(tmp_path)]) == 0
    assert json.loads((tmp_path / "start.json").read_text())["action"] == "start"
    chunk = json.loads((tmp_path / "chunk-000.json").read_text())
    assert chunk["batch_id"] == "DRY-RUN" and chunk["owner_token"] == "DRY-RUN" and chunk["evidence"][0]["series_id"] == "CN_PMI_MFG"
    assert json.loads((tmp_path / "finish.json").read_text()) == {"action": "finish", "batch_id": "DRY-RUN", "owner_token": "DRY-RUN", "total": 1, "series_outcomes": [{"series_id": "CN_PMI_MFG", "ok": True}]}


# ---------------------------------------------------------------- review fixes (T8-1, T8-2, SAFE trim, ingest non-JSON)
def test_failed_call_keeps_the_evidence_it_received(fake_transport):
    class FakeAk:
        @staticmethod
        def currency_boc_safe():
            requests.post("https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do")
            raise ValueError("parser blew up")
    spec = {**SAFE, "evidence_path": "/AppStructured/hlw/RMBQuery.do"}
    r = collect.collect_series(spec, "daily", dt.date(2026, 11, 6), FakeAk)
    assert r["error"].startswith("ValueError") and r["code"] == "collect_valueerror"
    assert len(r["evidence"]) == 1 and len(r["captures"]) == 1 and r["claims"] == []
    start, chunks, finish = collect.build_bodies([r], "B", "T", {"a": "1"})
    assert len(chunks[0]["evidence"]) == 1 and chunks[0]["claims"] == []
    assert finish["series_outcomes"] == [{"series_id": "CN_USDCNY_CP_D", "ok": False, "code": "collect_valueerror"}]


def test_zero_usable_claims_is_an_empty_series_failure(fake_transport):
    class FakeAk:
        @staticmethod
        def currency_boc_safe():
            requests.post("https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do")
            return pd.DataFrame({"日期": [], "美元": []})
    spec = {**SAFE, "evidence_path": "/AppStructured/hlw/RMBQuery.do"}
    r = collect.collect_series(spec, "daily", dt.date(2026, 11, 6), FakeAk)
    assert r["code"] == "empty_series" and r["error"].startswith("EmptySeries")
    assert collect.series_outcomes([r]) == [{"series_id": "CN_USDCNY_CP_D", "ok": False, "code": "empty_series"}]


def test_safe_cutoff_uses_the_passed_today_and_trims_to_the_html_first_date():
    today = dt.date(2026, 11, 6)
    df = pd.DataFrame({"日期": [dt.date(2025, 1, 1), dt.date(2026, 1, 5), dt.date(2026, 11, 5)], "美元": [1.0, 2.0, 3.0]})
    assert [c["period_label"] for c in collect.claims_from_frame(SAFE, df, today)] == ["2026-01-05", "2026-11-05"]
    html = b"<td>\n   2026-01-05\n  </td><td>\n 2026-11-05\n</td> value=\"2026-01-01\""
    cap = Capture("POST", "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do", 200, "text/html", html, "2026-11-06T00:00:00.000Z")
    assert collect._first_html_date([cap]) == "2026-01-05"


def test_safe_series_drops_claims_before_the_first_html_date(fake_transport, monkeypatch):
    class FakeAk:
        @staticmethod
        def currency_boc_safe():
            requests.post("https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do")
            return pd.DataFrame({"日期": [dt.date(2026, 1, 5), dt.date(2026, 11, 5)], "美元": [2.0, 3.0]})
    monkeypatch.setattr(collect, "_first_html_date", lambda ev: "2026-06-01")
    r = collect.collect_series({**SAFE, "evidence_path": "/AppStructured/hlw/RMBQuery.do"}, "daily", dt.date(2026, 11, 6), FakeAk)
    assert r["error"] is None and [c["period_label"] for c in r["claims"]] == ["2026-11-05"]


def test_http_poster_raises_ingest_error_on_a_non_json_200(monkeypatch):
    class Res:
        status_code, headers, text = 200, {"content-type": "text/html"}, "<html>"

        def json(self):
            raise ValueError("no json")
    monkeypatch.setattr(requests, "post", lambda *a, **k: Res())
    with pytest.raises(collect.IngestHttpError) as ei:
        collect.http_poster("https://x.test/ingest", "s")({"action": "start"})
    assert ei.value.code == "non_json_response"
