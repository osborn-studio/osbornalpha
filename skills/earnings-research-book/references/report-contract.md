# Earnings Research Book Contract

Every research book is a directory, not a single disposable document.

## Required Directory Layout

```text
<Company>-<FiscalPeriod>-Research/
├── README.md
├── chapters/
│   ├── 01_Executive_Summary.md
│   ├── 02_Investment_Thesis.md
│   ├── 03_Earnings_Release.md
│   ├── 04_Prepared_Remarks.md
│   ├── 05_Earnings_Call.md
│   ├── 06_QA.md
│   ├── 07_CEO_Interviews.md
│   ├── 08_Investor_Presentation.md
│   ├── 09_Wall_Street_Research.md
│   ├── 10_Key_Quotes.md
│   ├── 11_Competitive_Analysis.md
│   ├── 12_My_Analysis.md
│   └── 13_Appendix.md
├── sources/
├── references/
│   ├── references.json
│   └── references.bib
├── figures/
├── charts/
└── exports/
```

## Required Statement Pattern

For every important source-backed statement:

```text
Original English:
Chinese Translation:
Why it matters:
Investment implication:
Source:
```

## Chapter Rules

- Each chapter must be independently replaceable when a new quarter arrives.
- Each chapter frontmatter must include `chapter_id`, `ticker`, `fiscal_period`, `source_refs`, `update_status`, and `next_refresh`.
- Chapters may contain TODO blocks, but TODOs must name the missing source and preferred source owner.
- PDF exports must be generated from Markdown.
