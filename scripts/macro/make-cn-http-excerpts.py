"""scripts/macro/make-cn-http-excerpts.py — WP-D fixture excerpts (plan Task 1, amended 2026-11-16).

Builds the small repository fixtures for the official_http parsers from raw responses kept OUTSIDE the repository
(rights gate: CFETS requires written authorization for electronic extraction, PBOC reuse is uncleared; see
docs/audits/2026-11-07-macro-wpd/RECONCILE-2026-11-16.md). Never fetches anything.

  python3 scripts/macro/make-cn-http-excerpts.py <raw-dir>

<raw-dir> holds manifest.json plus CN_AFRE_STOCK-<year>.htm and CN_LPR_Q-<year>.json as recorded on 2026-11-07.
Output (src/lib/macro/fixtures/cn-http/):
  - PBOC stock tables: the original <table> start tag and the original rows 0..stock-row, cell-for-cell, so every
    row/cell index equals the one in the full file (locators stay valid against the full evidence bytes). Charset kept.
  - LPR: a synthetic JSON envelope in the recorded response shape carrying a handful of real quote rows.
  - manifest.json: per file the source URL, original sha256/bytes/fetched_at, excerpt rule, excerpt sha256.
"""
import hashlib, html, json, re, sys
from pathlib import Path

RAW = Path(sys.argv[1])
OUT = Path(__file__).resolve().parents[2] / "src/lib/macro/fixtures/cn-http"
AFRE_YEARS = [2015, 2019, 2024, 2026]          # quarterly layout, split label + odd rows, no blank row, partial year
LPR_2019 = ["2019-12-20", "2019-11-20", "2019-10-21", "2019-09-20", "2019-08-20", "2019-08-16", "2019-08-15"]
LPR_2026 = ["2026-10-20", "2026-09-20", "2026-08-20"]
sha = lambda b: hashlib.sha256(b).hexdigest()
raw_manifest = {f["file"]: f for f in json.loads((RAW / "manifest.json").read_text("utf-8"))["files"]}
OUT.mkdir(parents=True, exist_ok=True)
entries = []


def charset_of(b: bytes) -> str:
    m = re.search(rb'charset=["\']?([\w-]+)', b[:2048])
    return m.group(1).decode().lower()


def stock_row_index(rows, decode) -> int:
    hits = [i for i, r in enumerate(rows)
            if re.fullmatch(r"社会融资规模存量(AFRE\(stock\))?", re.sub(r"[\s　\xa0]+", "", decode(r).replace("（", "(").replace("）", ")")))]
    assert len(hits) == 1, hits
    return hits[0]


for year in AFRE_YEARS:
    name = f"CN_AFRE_STOCK-{year}.htm"
    raw = (RAW / name).read_bytes()
    cs = charset_of(raw)
    text = raw.decode("utf-8" if cs == "utf-8" else "gb18030")
    start = re.search(r"<table\b[^>]*>", text, re.I)
    body = text[start.end():]
    rows = re.findall(r"<tr\b.*?</tr>", body, re.S | re.I)

    def first_cell(r):
        m = re.search(r"<t[dh]\b.*?</t[dh]>", r, re.S | re.I)
        return html.unescape(re.sub(r"<[^>]+>", "", m.group(0))) if m else ""

    si = stock_row_index(rows, first_cell)
    excerpt = (f'<html><head><meta http-equiv=Content-Type content="text/html; charset={cs}"></head><body>\n'
               f'<!-- excerpt of {name}: rows 0..{si} of the first table, verbatim; see manifest.json -->\n'
               + start.group(0) + "\n" + "\n".join(rows[: si + 1]) + "\n</table>\n</body></html>\n")
    data = excerpt.encode("utf-8" if cs == "utf-8" else "gb18030")
    (OUT / name).write_bytes(data)
    src = raw_manifest[name]
    entries.append({"file": name, "series": "CN_AFRE_STOCK_YOY", "kind": "excerpt", "charset": cs, "rows": f"0..{si}",
                    "source_url": src["requested_url"], "source_sha256": src["sha256"], "source_bytes": src["bytes"],
                    "source_fetched_at": src["fetched_at"], "source_content_type": src["content_type"],
                    "excerpt_sha256": sha(data), "excerpt_bytes": len(data)})

for year, dates in ((2019, LPR_2019), (2026, LPR_2026)):
    name = f"CN_LPR_Q-{year}.json"
    raw = (RAW / name).read_bytes()
    doc = json.loads(raw.decode("utf-8"))
    recs = [r for r in doc["records"] if r["showDateCN"] in dates]
    assert [r["showDateCN"] for r in recs] == dates, (year, [r["showDateCN"] for r in recs])
    env = {"head": {"version": "2.0", "provider": "CWAP", "req_code": "", "rep_code": "200", "rep_message": "", "producer": ""},
           "data": {"endDateCN": f"{year}-12-31", "baseCurveCfgList": ["1Y", "5Y"], "startDateCN": f"{year}-01-01", "message": ""},
           "records": recs}
    data = (json.dumps(env, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    (OUT / name).write_bytes(data)
    src = raw_manifest[name]
    entries.append({"file": name, "series": "CN_LPR_Q", "kind": "synthetic-envelope", "charset": "utf-8",
                    "records": f"{len(recs)} of {len(doc['records'])} real rows (newest first)",
                    "source_url": src["requested_url"], "source_sha256": src["sha256"], "source_bytes": src["bytes"],
                    "source_fetched_at": src["fetched_at"], "source_content_type": src["content_type"],
                    "excerpt_sha256": sha(data), "excerpt_bytes": len(data)})

(OUT / "manifest.json").write_text(json.dumps({"builder": "make-cn-http-excerpts/1", "note": "Excerpts only. Full responses are kept outside the repository (rights gate); source_sha256 identifies them.", "files": entries}, ensure_ascii=False, indent=1) + "\n", "utf-8")
for e in entries:
    print(e["file"], e["excerpt_bytes"], "bytes from", e["source_bytes"])
