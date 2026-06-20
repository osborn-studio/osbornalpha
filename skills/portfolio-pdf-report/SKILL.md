---
name: portfolio-pdf-report
description: Convert portfolio PDFs, hedge fund position reports, or trading PDF exports into a temporary searchable multidimensional HTML report with filters, sorting, summary metrics, option/FX/market exposure tables, and CSV copy support. Use for requests like "PDF 转多维报表", "portfolio PDF 查询筛选网页", "持仓 PDF 变网页", "Notional report", or "快速查询持仓".
---

# Portfolio PDF Report

Create a fast local HTML report from a portfolio PDF. The default workflow is optimized for one-page hedge fund position PDFs that contain top metrics, options, FX rates, market exposure, and Long/Short/Flat holdings.

## Workflow

1. Generate the report:

```bash
python3 skills/portfolio-pdf-report/scripts/generate_portfolio_report.py /path/to/portfolio.pdf -o tmp/portfolio_report
```

2. Serve it locally when the user wants to interact with it:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 -d tmp/portfolio_report
```

3. Open `http://127.0.0.1:8765/index.html`.

## Output

The script writes:

- `index.html` - self-contained searchable report
- `portfolio-data.json` - extracted structured data

The report includes:

- Key metrics cards
- Global search across ticker, name, sector, country, and side
- Filters for side, market, sector, and minimum exposure
- Sortable holdings table
- Option, FX, market exposure, and sector summary tables
- CSV copy for the current filtered view
- Embedded download link for the original PDF
- Raw PDF text fallback for audit/search

## Validation

After generation, verify:

- Position counts look plausible against the source PDF
- `fx`, `market`, `options`, and `positions` are populated in `portfolio-data.json`
- The page opens without browser console errors
- Search and filters update row counts

For browser verification, prefer Playwright or the in-app browser. If Playwright's bundled Chromium is unavailable, use the system Chrome executable.

## Notes

- This skill is meant for quick analysis and temporary reporting, not audited financial records.
- Do not fabricate missing fields. Preserve raw PDF text so users can inspect extraction edge cases.
- If the PDF layout differs substantially, inspect the raw text first and adjust `scripts/generate_portfolio_report.py` conservatively.
