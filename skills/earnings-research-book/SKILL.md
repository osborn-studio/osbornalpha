---
name: earnings-research-book
description: Use this skill when the user wants an institutional earnings deep research book, bilingual quote-preserving financial report, semiconductor earnings knowledge base, or reusable quarter-by-quarter earnings research workflow for a public company. Trigger on earnings deep research, 10-Q/PPT/PDF source collection, Wall Street quote database, incremental chapter updates, or "generate a Goldman/Morgan Stanley style research book". Do not use when the user only wants a short news summary, price quote, trading execution, non-public paid research redistribution, or investment advice without source evidence.
license: Commercial
compatibility: Requires Python 3.11+ for local scaffolding and network access for source PDF downloads.
---

# Earnings Research Book

## Purpose

Create and maintain a source-first earnings research knowledge base for one public company and one reporting period. The default output is a Chinese institutional research book that preserves important English source quotations, adds Chinese translation, explains why each quote matters, and separates investment implications from facts.

## Workflow

1. Resolve the company, ticker, fiscal period, exchange, and report deadline.
2. Create or update the research workspace with `scripts/generate_earnings_research_book.py`.
3. Download every available original PDF or source file into `sources/`: earnings release, prepared remarks, investor presentation, 10-Q/10-K, supplemental deck, and investor presentation.
4. Build `references/references.json` and `references/references.bib` before drafting analysis.
5. Draft chapters as independent Markdown modules with stable IDs, source dependencies, quote records, update status, and next-refresh notes.
6. For every important claim, include original English, Chinese translation, why it matters, and investment implication.
7. Export PDF only after Markdown source, references database, and source inventory pass validation.

## Defaults

- Use Chinese for analysis and commentary.
- Preserve English source quotations verbatim and keep them attached to source metadata.
- Store original files under `sources/`; never cite a file that is not recorded in `references/`.
- Use incremental chapters instead of one monolithic report.
- Treat sell-side research and interviews as secondary evidence unless the original company filing or transcript confirms the point.

## Resources

- `scripts/generate_earnings_research_book.py`: Creates the knowledge base, downloads source files, and writes references.
- `references/report-contract.md`: Required report structure and chapter contract.
- `references/source-policy.md`: Source quality, citation, and copyright boundaries.
- `references/chapter-template.md`: Incremental Markdown chapter format.
- `evals/evals.json`: Regression checks for trigger behavior and output contract.

## Validation

- Confirm `sources/` contains all available original PDFs/source files or an explicit missing-source TODO.
- Confirm `references/references.json` and `references/references.bib` include every downloaded source.
- Confirm every chapter has frontmatter with `chapter_id`, `source_refs`, `update_status`, and `next_refresh`.
- Confirm important statements retain original English plus Chinese translation.
- Confirm PDF export is generated from the Markdown source, not separately rewritten.

## Guardrails

- Do not fabricate transcripts, target prices, EPS revisions, or analyst quotes.
- Do not redistribute paid Wall Street reports unless the user has provided lawful access and redistribution rights.
- Do not present commentary as investment advice; label it as research analysis.
- Do not skip source capture because the report is urgent; missing sources must be recorded as TODO items.
