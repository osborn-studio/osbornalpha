"""scripts/macro/collect.py — China macro collector (spec §4.4, §0.2 M1/M9/M24, §13).

Runs on the Mac (launchd, scripts/macro/launchd.plist.template), never on Vercel. For every active CN
series in scripts/macro/cn-series.json (exported from src/lib/macro/catalog.ts by
scripts/macro/export-cn-series.ts, so the TS catalog stays the single source of truth) it calls the exact
AKShare function inside recorder.recording(), keeps as evidence only the data response(s) of the call (host =
the series' official fetch host, URL path = evidence_path, HTTP 200), and builds claims from AKShare's
DataFrame. The server re-parses the evidence bytes with the TS parsers; numbers from Python are never stored.

Claims: AKShare converts NBS / ChinaBond / SAFE values with pd.to_numeric (float64), so a claim is
repr(float) — Python's shortest round-trip text, equal to the source decimal whenever the source has at most
15 significant digits (true for every series here). Claims are cross-checks only (server: decimal equality,
mismatch → quarantine adapter_mismatch); NaN produces no claim.

Protocol (POST $MACRO_INGEST_URL, Authorization: Bearer $MACRO_INGEST_SECRET, each body <= 3.5 MB):
  {"action":"start","tool_versions":{...},"takeover"?:true}                 -> {"batch_id","owner_token"}
  {"action":"chunk","batch_id","owner_token","seq","total","evidence":[...],"claims":[...]} -> receipt (duplicate-safe)
  {"action":"finish","batch_id","owner_token","total","series_outcomes":[{"series_id","ok","code"?}]} -> batch receipt
                                                         (resumable; total may be 0 when every series failed)
evidence item: {series_id, sha256, url, status, content_type, fetched_at, bytes_b64}
claim item:    {series_id, period_label, value_text}

Restart rule (plan 第 5 稿 P1-3/P2-1): a chunk still answering 409 chunk_in_progress after its retries (a crashed request left
it 'processing'), or any 409 fenced (this batch's owner token was superseded), restarts the WHOLE collection once: start
{takeover:true} (polling 409 batch_running while the stalled run is younger than the server's 10-minute processing timeout),
then every chunk again under the new batch and token, from the in-memory results. The old batch's remaining chunks are
never sent; the server finishes the old batch failed. A finish answering 503 publish_pending is retried by the poster
(same owner token, resumable finish); if it keeps failing the run stays 'finishing' and the next collection supersedes it.

Usage:
  collect.py [--mode daily|backfill] [--series CN_X ...] [--dry-run DIR] [--record-fixtures DIR]
--dry-run writes start/chunk/finish bodies to DIR and sends nothing; --record-fixtures saves every
evidence response, claims.json, manifest.json and verification.json to DIR and sends nothing.
"""
from __future__ import annotations

import argparse
import base64
import datetime as _dt
import json
import math
import os
import platform
import re
import sys
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))  # recorder.py sits next to this file (also under python -I)
from recorder import Capture, recording  # noqa: E402

COLLECTOR_VERSION = "macro-collect/1"
MAX_BODY_BYTES = 3_500_000
HERE = Path(__file__).resolve().parent
SPEC_FILE = HERE / "cn-series.json"
EXT = {"application/json": "json", "text/html": "html", "text/csv": "csv", "text/plain": "txt"}


# ---------------------------------------------------------------- spec and calls
def load_specs(path: Path = SPEC_FILE) -> List[Dict[str, Any]]:
    doc = json.loads(path.read_text("utf-8"))
    if doc.get("version") != "cn-series/1" or not isinstance(doc.get("series"), list):
        raise SystemExit(f"unexpected spec file {path}")
    return doc["series"]


def _yearly_windows(start: _dt.date, end: _dt.date) -> List[Tuple[str, str]]:
    out, cur = [], start
    while cur <= end:
        stop = min(_dt.date(cur.year, 12, 31), end)
        out.append((cur.strftime("%Y%m%d"), stop.strftime("%Y%m%d")))
        cur = _dt.date(cur.year + 1, 1, 1)
    return out


def calls_for(spec: Dict[str, Any], mode: str, today: _dt.date) -> List[Dict[str, Any]]:
    """Keyword arguments of each AKShare call for one series."""
    fn = spec["function"]
    if fn == "macro_china_nbs_nation":
        if mode == "backfill":
            return [{"kind": spec["kind"], "path": b["path"], "period": b["period"]} for b in spec["backfill"]]
        return [{"kind": spec["kind"], "path": spec["path"], "period": spec["daily_period"]}]
    if fn == "bond_china_yield":
        if mode == "backfill":
            start = _dt.date.fromisoformat(spec["backfill_from"])
            return [{"start_date": a, "end_date": b} for a, b in _yearly_windows(start, today)]
        start = today - _dt.timedelta(days=int(spec["window_days"]))
        return [{"start_date": start.strftime("%Y%m%d"), "end_date": today.strftime("%Y%m%d")}]
    if fn == "currency_boc_safe":
        return [{}]
    raise SystemExit(f"unsupported function {fn}")


def is_evidence(spec: Dict[str, Any], cap: Capture) -> bool:
    parts = urlsplit(cap.url)
    return cap.status == 200 and parts.scheme == "https" and parts.hostname == spec["fetch_host"] and parts.path == spec["evidence_path"]


# ---------------------------------------------------------------- claims
def _norm_label(s: str) -> str:
    return re.sub(r"[\s_]", "", str(s))


def value_text(v: Any) -> Optional[str]:
    """repr of a finite float, else None. Never str() of a formatted number."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return repr(f) if math.isfinite(f) else None


def claims_from_frame(spec: Dict[str, Any], df: Any) -> List[Dict[str, str]]:
    sid, fn, out = spec["series_id"], spec["function"], []
    if df is None or len(df) == 0:
        return out
    if fn == "macro_china_nbs_nation":
        target = _norm_label(spec["column"])
        rows = [label for label in df.index if _norm_label(label) == target]
        if len(rows) != 1:
            raise ValueError(f"{sid}: indicator row {spec['column']!r} found {len(rows)} times")
        for col in df.columns:
            vt = value_text(df.at[rows[0], col])
            if vt is not None:
                out.append({"series_id": sid, "period_label": str(col), "value_text": vt})
        return out
    if fn == "bond_china_yield":
        sub = df[df["曲线名称"] == spec["curve"]]
        for _, row in sub.iterrows():
            vt = value_text(row[spec["column"]])
            if vt is not None:
                out.append({"series_id": sid, "period_label": str(row["日期"]), "value_text": vt})
        return out
    if fn == "currency_boc_safe":
        cutoff = _dt.date.today() - _dt.timedelta(days=400)   # the XLSX history is not evidence: no claims for it
        for _, row in df.iterrows():
            d = row["日期"]
            if d is None or (isinstance(d, float) and math.isnan(d)) or _dt.date.fromisoformat(str(d)) < cutoff:
                continue
            vt = value_text(row[spec["column"]])
            if vt is not None:
                out.append({"series_id": sid, "period_label": str(d), "value_text": vt})
        return out
    raise ValueError(f"unsupported function {fn}")


# ---------------------------------------------------------------- evidence and chunks
def evidence_item(series_id: str, cap: Capture) -> Dict[str, Any]:
    return {"series_id": series_id, "sha256": cap.sha256, "url": cap.url, "status": cap.status,
            "content_type": cap.content_type, "fetched_at": cap.fetched_at,
            "bytes_b64": base64.b64encode(cap.body).decode("ascii")}


def _size(obj: Any) -> int:
    return len(json.dumps(obj, separators=(",", ":")).encode("utf-8"))


def pack_chunks(batch_id: str, items: List[Dict[str, Any]], claims: Dict[str, List[Dict[str, str]]],
                limit: int = MAX_BODY_BYTES) -> List[Dict[str, Any]]:
    """Greedy packing of evidence items into chunk bodies <= limit bytes. Every chunk that carries evidence of
    a series also carries that series' claims (the server cross-checks per chunk). Raises if one item cannot fit."""
    chunks: List[Dict[str, Any]] = []
    cur: List[Dict[str, Any]] = []

    def body(ev: List[Dict[str, Any]]) -> Dict[str, Any]:
        sids = sorted({e["series_id"] for e in ev})
        return {"action": "chunk", "batch_id": batch_id, "seq": 0, "total": 0, "evidence": ev,
                "claims": [c for s in sids for c in claims.get(s, [])]}

    for it in items:
        if cur and _size(body(cur + [it])) > limit:
            chunks.append(body(cur))
            cur = []
        if _size(body([it])) > limit:
            raise ValueError(f"evidence {it['sha256']} of {it['series_id']} exceeds {limit} bytes")
        cur.append(it)
    if cur:
        chunks.append(body(cur))
    for i, c in enumerate(chunks):
        c["seq"], c["total"] = i, len(chunks)
    return chunks


def tool_versions() -> Dict[str, str]:
    import akshare
    import pandas
    return {"akshare": akshare.__version__, "pandas": pandas.__version__, "python": platform.python_version(),
            "collector": COLLECTOR_VERSION}


# ---------------------------------------------------------------- collection
def _numbers_in(body: bytes, content_type: str) -> set:
    """Decimal values present in the raw bytes (JSON string values / HTML cell texts) for the locate check."""
    text = body.decode("utf-8", errors="replace")
    raw = re.findall(r'"value":"(-?\d+(?:\.\d+)?)"', text) if "json" in content_type else re.findall(r">\s*(-?\d+(?:\.\d+)?)\s*(?:&nbsp;?)?\s*<", text)
    out = set()
    for r in raw:
        try:
            out.add(Decimal(r))
        except InvalidOperation:
            pass
    return out


def collect_series(spec: Dict[str, Any], mode: str, today: _dt.date, ak: Any) -> Dict[str, Any]:
    """Calls AKShare for one series; returns {series_id, captures, evidence, claims, error}."""
    fn = getattr(ak, spec["function"])
    caps: List[Capture] = []
    evidence: List[Capture] = []
    claims: List[Dict[str, str]] = []
    try:
        for kwargs in calls_for(spec, mode, today):
            with recording() as got:
                df = fn(**kwargs)
            caps.extend(got)
            evidence.extend(c for c in got if is_evidence(spec, c))
            claims.extend(claims_from_frame(spec, df))
        if not evidence:
            raise RuntimeError(f"no evidence response from {spec['fetch_host']}{spec['evidence_path']}")
        return {"series_id": spec["series_id"], "captures": caps, "evidence": evidence, "claims": claims, "error": None, "code": None}
    except Exception as e:  # one failing series never stops the others; its outcome is reported in finish (P2-2)
        return {"series_id": spec["series_id"], "captures": caps, "evidence": [], "claims": [], "error": f"{type(e).__name__}: {e}"[:300],
                "code": f"collect_{type(e).__name__}".lower()[:64]}


def verification(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for r in results:
        nums = set()
        for c in r["evidence"]:
            nums |= _numbers_in(c.body, c.content_type)
        located = sum(1 for c in r["claims"] if Decimal(c["value_text"]) in nums)
        out.append({"series_id": r["series_id"], "error": r["error"], "evidence": [{"url": c.url, "status": c.status, "sha256": c.sha256, "bytes": len(c.body)} for c in r["evidence"]],
                    "other_responses": [{"url": c.url, "status": c.status, "content_type": c.content_type} for c in r["captures"] if c not in r["evidence"]],
                    "claims": len(r["claims"]), "claims_located_in_bytes": located})
    return out


def record_fixtures(results: List[Dict[str, Any]], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest, claims = [], {}
    for r in results:
        claims[r["series_id"]] = r["claims"]
        for i, c in enumerate(r["evidence"]):
            ext = EXT.get(c.content_type.split(";")[0].strip().lower(), "bin")
            name = f"{r['series_id']}-{i:02d}.{ext}"
            (out_dir / name).write_bytes(c.body)
            manifest.append({"series_id": r["series_id"], "file": name, "url": c.url, "status": c.status, "content_type": c.content_type,
                             "fetched_at": c.fetched_at, "sha256": c.sha256})
    (out_dir / "manifest.json").write_text(json.dumps({"tool_versions": tool_versions(), "files": manifest}, ensure_ascii=False, indent=1) + "\n", "utf-8")
    (out_dir / "claims.json").write_text(json.dumps(claims, ensure_ascii=False, indent=1) + "\n", "utf-8")
    (out_dir / "verification.json").write_text(json.dumps(verification(results), ensure_ascii=False, indent=1) + "\n", "utf-8")


def series_outcomes(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """One outcome per expected series (plan 第 4 稿 P2-2): the server counts each failed series as failed and records it in
    the batch errors and collection freshness, so one dead source can never yield a 'success' batch."""
    return [{"series_id": r["series_id"], "ok": True} if not r["error"] else {"series_id": r["series_id"], "ok": False, "code": r.get("code") or "collect_failed"}
            for r in results]


def build_bodies(results: List[Dict[str, Any]], batch_id: str, owner_token: str, versions: Dict[str, str],
                 takeover: bool = False) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
    ok = [r for r in results if not r["error"]]
    items = [evidence_item(r["series_id"], c) for r in ok for c in r["evidence"]]
    claims = {r["series_id"]: r["claims"] for r in ok}
    chunks = [{**c, "owner_token": owner_token} for c in pack_chunks(batch_id, items, claims)]   # the token fences every write (P1-3)
    start: Dict[str, Any] = {"action": "start", "tool_versions": versions}
    if takeover:
        start["takeover"] = True
    return (start, chunks,
            {"action": "finish", "batch_id": batch_id, "owner_token": owner_token, "total": len(chunks), "series_outcomes": series_outcomes(results)})


Post = Callable[[Dict[str, Any]], Dict[str, Any]]


class IngestHttpError(RuntimeError):
    """A non-200 answer after the poster's own retries; `code` is the route's error code (batch_running, chunk_in_progress,
    fenced, publish_pending, ...)."""

    def __init__(self, action: str, status: int, code: str):
        super().__init__(f"{action} -> HTTP {status} {code}")
        self.action, self.status, self.code = action, status, code


class Restart(Exception):
    """The batch cannot be completed (fenced, or a chunk stuck in 'processing'): start over under a new batch."""


def http_poster(url: str, secret: str, timeout: float = 120.0) -> Post:
    import requests

    def post(body: Dict[str, Any]) -> Dict[str, Any]:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        for attempt in range(4):
            try:
                res = requests.post(url, data=data, timeout=timeout,
                                    headers={"authorization": f"Bearer {secret}", "content-type": "application/json"})
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
                continue
            if res.status_code >= 500 and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            payload = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            if res.status_code != 200:
                raise IngestHttpError(body["action"], res.status_code, str(payload.get("error", {}).get("code", "")))
            return payload
        raise RuntimeError("unreachable")
    return post


def _start(post: Post, versions: Dict[str, str], takeover: bool, sleep: Callable[[float], None], polls: int, poll_s: float) -> Dict[str, Any]:
    body: Dict[str, Any] = {"action": "start", "tool_versions": versions, **({"takeover": True} if takeover else {})}
    for attempt in range(polls + 1 if takeover else 1):
        try:
            return post(body)
        except IngestHttpError as e:
            # a takeover aborts the old run only once its processing chunk is older than the server timeout (10 min)
            if takeover and e.code == "batch_running" and attempt < polls:
                sleep(poll_s)
                continue
            raise
    raise RuntimeError("unreachable")


def _post_chunk(post: Post, body: Dict[str, Any], sleep: Callable[[float], None], retries: int) -> Dict[str, Any]:
    for attempt in range(retries + 1):
        try:
            return post(body)
        except IngestHttpError as e:
            if e.code == "fenced":
                raise Restart("fenced") from e
            if e.code == "chunk_in_progress":            # another request holds it; if it never completes, it crashed
                if attempt == retries:
                    raise Restart("chunk_stalled") from e
                sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError("unreachable")


def send(results: List[Dict[str, Any]], post: Post, versions: Dict[str, str], sleep: Callable[[float], None] = time.sleep,
         chunk_retries: int = 4, start_polls: int = 15, poll_s: float = 60.0, max_restarts: int = 1) -> Dict[str, Any]:
    """start → chunks → finish under one owner token; on Restart, the whole collection once more under a NEW batch."""
    restarts: List[Dict[str, str]] = []
    reason: Optional[str] = None
    for attempt in range(max_restarts + 1):
        # chunk_stalled: poll until the server may abort our stalled run; fenced: someone else owns the lease → one try
        start = _start(post, versions, reason is not None, sleep, start_polls if reason == "chunk_stalled" else 0, poll_s)
        batch_id, token = start["batch_id"], start["owner_token"]
        _, chunks, finish = build_bodies(results, batch_id, token, versions)
        try:
            receipts = [_post_chunk(post, c, sleep, chunk_retries) for c in chunks]
            try:
                done = post(finish)
            except IngestHttpError as e:
                if e.code == "fenced":
                    raise Restart("fenced") from e
                raise
            return {"batch_id": batch_id, "chunks": len(chunks), "chunk_receipts": receipts, "finish": done, "restarts": restarts}
        except Restart as r:
            reason = str(r)
            restarts.append({"batch_id": batch_id, "reason": reason})
            if attempt == max_restarts:
                raise RuntimeError(f"ingest failed after {len(restarts)} attempts: {restarts}") from r
    raise RuntimeError("unreachable")


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--mode", choices=["daily", "backfill"], default="daily")
    ap.add_argument("--series", nargs="*", help="limit to these series ids")
    ap.add_argument("--dry-run", type=Path, help="write request bodies to DIR, send nothing")
    ap.add_argument("--record-fixtures", type=Path, help="save evidence + manifest/claims/verification to DIR, send nothing")
    ap.add_argument("--spec", type=Path, default=SPEC_FILE)
    args = ap.parse_args(argv)
    specs = [s for s in load_specs(args.spec) if not args.series or s["series_id"] in args.series]
    if args.series and len(specs) != len(set(args.series)):
        raise SystemExit("unknown --series id")
    import akshare as ak
    today = _dt.date.today()
    results = [collect_series(s, args.mode, today, ak) for s in specs]
    for r in results:
        print(f"{r['series_id']}\tevidence={len(r['evidence'])}\tclaims={len(r['claims'])}\t{r['error'] or 'ok'}", file=sys.stderr)
    versions = tool_versions()
    if args.record_fixtures:
        record_fixtures(results, args.record_fixtures)
    if args.dry_run:
        args.dry_run.mkdir(parents=True, exist_ok=True)
        start, chunks, finish = build_bodies(results, "DRY-RUN", "DRY-RUN", versions)
        (args.dry_run / "start.json").write_text(json.dumps(start, indent=1) + "\n", "utf-8")
        for c in chunks:
            (args.dry_run / f"chunk-{c['seq']:03d}.json").write_text(json.dumps(c, separators=(",", ":")) + "\n", "utf-8")
        (args.dry_run / "finish.json").write_text(json.dumps(finish, indent=1) + "\n", "utf-8")
    if args.record_fixtures or args.dry_run:
        return 1 if any(r["error"] for r in results) else 0
    url, secret = os.environ.get("MACRO_INGEST_URL"), os.environ.get("MACRO_INGEST_SECRET")
    if not url or not secret:
        raise SystemExit("MACRO_INGEST_URL and MACRO_INGEST_SECRET are required")
    summary = send(results, http_poster(url, secret), versions)   # failed series travel as series_outcomes
    print(json.dumps({"batch_id": summary["batch_id"], "chunks": summary["chunks"], "finish": summary["finish"], "restarts": summary["restarts"],
                      "series_errors": {r["series_id"]: r["error"] for r in results if r["error"]}}, ensure_ascii=False))
    return 1 if any(r["error"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
