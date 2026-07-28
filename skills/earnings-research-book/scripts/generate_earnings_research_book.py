#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


CHAPTERS = [
    ("01_executive_summary", "01_Executive_Summary.md", "Executive Summary"),
    ("02_investment_thesis", "02_Investment_Thesis.md", "Investment Thesis"),
    ("03_earnings_release", "03_Earnings_Release.md", "Official Earnings Release"),
    ("04_prepared_remarks", "04_Prepared_Remarks.md", "Prepared Remarks"),
    ("05_earnings_call", "05_Earnings_Call.md", "Earnings Call Transcript"),
    ("06_qa", "06_QA.md", "Q&A By Topic"),
    ("07_ceo_interviews", "07_CEO_Interviews.md", "CEO Interviews"),
    ("08_investor_presentation", "08_Investor_Presentation.md", "Investor Presentation"),
    ("09_wall_street_research", "09_Wall_Street_Research.md", "Wall Street Research"),
    ("10_key_quotes", "10_Key_Quotes.md", "Key Quotes"),
    ("11_competitive_analysis", "11_Competitive_Analysis.md", "Competitive Analysis"),
    ("12_my_analysis", "12_My_Analysis.md", "My Analysis"),
    ("13_appendix", "13_Appendix.md", "Appendix"),
]

SOURCE_TYPES = {
    "earnings_release",
    "prepared_remarks",
    "transcript",
    "10q",
    "10k",
    "investor_presentation",
    "supplemental_deck",
    "interview",
    "sell_side",
    "news",
    "other",
}


def slugify(value: str) -> str:
    value = value.strip().replace("&", "and")
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "research-book"


def parse_source(raw: str) -> dict[str, str]:
    if "=" in raw and not raw.startswith("http"):
        source_type, url = raw.split("=", 1)
    else:
        source_type, url = "other", raw
    source_type = source_type.strip().lower().replace("-", "_")
    if source_type not in SOURCE_TYPES:
        source_type = "other"
    return {"type": source_type, "url": url.strip()}


def guess_filename(url: str, source_type: str) -> str:
    parsed = urllib.parse.urlparse(url)
    name = Path(urllib.parse.unquote(parsed.path)).name
    if not name or "." not in name:
        name = f"{source_type}.source"
    return slugify(name)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> tuple[bool, str | None]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "OsbornAlphaResearchBot/0.1 (+source-first public market research)",
            "Accept": "application/pdf,text/html,application/octet-stream,*/*",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            destination.write_bytes(response.read())
        return True, None
    except Exception as exc:  # noqa: BLE001 - CLI should record retrieval failures.
        return False, str(exc)


def bib_key(ticker: str, source_type: str, index: int, year: str) -> str:
    return f"{re.sub(r'[^A-Za-z0-9]', '', ticker).lower()}{year}{source_type}{index}"


def make_reference(
    *,
    ticker: str,
    company: str,
    period: str,
    source_type: str,
    url: str,
    index: int,
    downloaded_path: Path | None,
    error: str | None,
) -> dict[str, Any]:
    today = dt.date.today().isoformat()
    year = today[:4]
    ref_id = bib_key(ticker, source_type, index, year)
    item: dict[str, Any] = {
        "id": ref_id,
        "company": company,
        "ticker": ticker,
        "fiscal_period": period,
        "source_type": source_type,
        "title": f"{company} {period} {source_type.replace('_', ' ').title()}",
        "url": url,
        "accessed": today,
        "language": "en",
        "rights": "User must confirm redistribution rights for non-public or paid sources.",
        "status": "downloaded" if downloaded_path else "todo",
    }
    if downloaded_path:
        item["local_path"] = downloaded_path.as_posix()
        item["sha256"] = sha256(downloaded_path)
    if error:
        item["retrieval_error"] = error
    return item


def write_bib(references: list[dict[str, Any]], path: Path) -> None:
    entries = []
    for ref in references:
        entries.append(
            "\n".join(
                [
                    f"@misc{{{ref['id']},",
                    f"  title = {{{ref['title']}}},",
                    f"  author = {{{ref['company']}}},",
                    f"  year = {{{ref['accessed'][:4]}}},",
                    f"  url = {{{ref['url']}}},",
                    f"  note = {{Accessed {ref['accessed']}; source type: {ref['source_type']}}}",
                    "}",
                ]
            )
        )
    path.write_text("\n\n".join(entries) + ("\n" if entries else ""), encoding="utf-8")


def chapter_text(chapter_id: str, title: str, company: str, ticker: str, period: str, today: str) -> str:
    return f"""---
chapter_id: "{chapter_id}"
title: "{title}"
ticker: "{ticker}"
company: "{company}"
fiscal_period: "{period}"
source_refs: []
update_status: "draft"
last_updated: "{today}"
next_refresh: "Refresh this chapter when a new filing, deck, transcript, interview, or analyst revision changes the evidence."
depends_on: []
---

# {title}

## Update Notes

- What changed this quarter:
- What must be refreshed next quarter:
- Missing sources:

## Source-Backed Findings

### Finding 1

Original English:

> TODO: paste short source quotation and attach source ref.

Chinese Translation:

TODO

Why it matters:

TODO

Investment implication:

TODO

Source:

TODO

## Analysis

TODO: Write Chinese analysis. Keep facts, management claims, analyst interpretation, and investment implications separated.
"""


def write_readme(root: Path, company: str, ticker: str, period: str, refs: list[dict[str, Any]]) -> None:
    downloaded = sum(1 for ref in refs if ref["status"] == "downloaded")
    root.joinpath("README.md").write_text(
        f"""# {company} {period} Earnings Research Book

Ticker: `{ticker}`

This is a maintainable earnings research knowledge base. Markdown chapters are the source of truth; PDF exports should be generated from the Markdown files.

## Inventory

- Sources recorded: {len(refs)}
- Sources downloaded: {downloaded}
- References JSON: `references/references.json`
- References BibTeX: `references/references.bib`
- Incremental chapters: `chapters/`

## Generate Or Refresh

```bash
python3 scripts/generate_earnings_research_book.py "{company}" "{ticker}" "{period}" --output <output-root> --source-url earnings_release=https://...
```

## Report Rule

Every important statement must include:

1. Original English
2. Chinese translation
3. Why it matters
4. Investment implication
5. Source reference

## PDF Export

Export only after source inventory and references are complete. Suggested tools: Pandoc, WeasyPrint, or a controlled manuscript-to-PDF renderer.
""",
        encoding="utf-8",
    )


def create_book(args: argparse.Namespace) -> Path:
    today = dt.date.today().isoformat()
    root = args.output / f"{slugify(args.company)}-{slugify(args.period)}-Research"
    for name in ("chapters", "sources", "references", "figures", "charts", "exports"):
        (root / name).mkdir(parents=True, exist_ok=True)

    references: list[dict[str, Any]] = []
    for idx, raw in enumerate(args.source_url, start=1):
        parsed = parse_source(raw)
        filename = f"{idx:02d}_{parsed['type']}_{guess_filename(parsed['url'], parsed['type'])}"
        destination = root / "sources" / filename
        ok, error = download(parsed["url"], destination)
        if not ok and destination.exists():
            destination.unlink()
        references.append(
            make_reference(
                ticker=args.ticker,
                company=args.company,
                period=args.period,
                source_type=parsed["type"],
                url=parsed["url"],
                index=idx,
                downloaded_path=destination.relative_to(root) if ok else None,
                error=error,
            )
        )

    if not references:
        references.append(
            {
                "id": bib_key(args.ticker, "source_inventory", 1, today[:4]),
                "company": args.company,
                "ticker": args.ticker,
                "fiscal_period": args.period,
                "source_type": "source_inventory",
                "title": f"{args.company} {args.period} source inventory TODO",
                "url": "",
                "accessed": today,
                "language": "en",
                "rights": "Record original public URLs before drafting.",
                "status": "todo",
                "retrieval_error": "No --source-url values provided.",
            }
        )

    refs_payload = {
        "schema_version": "1.0",
        "company": args.company,
        "ticker": args.ticker,
        "fiscal_period": args.period,
        "created": today,
        "updated": today,
        "references": references,
    }
    (root / "references" / "references.json").write_text(
        json.dumps(refs_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_bib(references, root / "references" / "references.bib")

    for chapter_id, filename, title in CHAPTERS:
        path = root / "chapters" / filename
        if not path.exists() or args.force:
            path.write_text(chapter_text(chapter_id, title, args.company, args.ticker, args.period, today), encoding="utf-8")

    inventory = {
        "company": args.company,
        "ticker": args.ticker,
        "fiscal_period": args.period,
        "source_count": len(references),
        "downloaded_count": sum(1 for ref in references if ref["status"] == "downloaded"),
        "chapters": [{"chapter_id": cid, "path": f"chapters/{filename}", "title": title} for cid, filename, title in CHAPTERS],
    }
    (root / "source_inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_readme(root, args.company, args.ticker, args.period, references)
    return root


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Create an incremental earnings research book knowledge base.")
    parser.add_argument("company", help="Company name, e.g. Micron Technology")
    parser.add_argument("ticker", help="Ticker, e.g. MU")
    parser.add_argument("period", help="Fiscal period, e.g. FY2026 Q3")
    parser.add_argument("--output", type=Path, default=Path("research-books"), help="Output root directory.")
    parser.add_argument(
        "--source-url",
        action="append",
        default=[],
        help="Source URL to download. Use type=url where type is earnings_release, prepared_remarks, transcript, 10q, investor_presentation, interview, sell_side, news, or other.",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing chapter templates.")
    args = parser.parse_args(argv)
    args.output.mkdir(parents=True, exist_ok=True)
    root = create_book(args)
    print(json.dumps({"status": "ok", "research_root": str(root), "references": str(root / "references" / "references.json")}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
