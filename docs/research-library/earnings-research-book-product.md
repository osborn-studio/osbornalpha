# Earnings Research Book Product Engineering Note

Date: 2026-06-25

## Product

OsbornAlpha Research Library is available at `/research/library` for maintainable earnings research books. The first workflow is `research.earnings-research-book`, registered in the Osborn Studio Skill Hub with a local Stock Monitor fallback copy.

## Skill Location

```text
/Users/gilbertchen/Documents/CODE/stock-monitor/skills/earnings-research-book
/Users/gilbertchen/Documents/CODE/osborn-studio-skill-hub/skills/research/earnings-research-book
```

## Runtime Contract

Input:

- company name
- ticker
- fiscal period
- original source URLs

Output:

- Markdown research book
- source files under `sources/`
- `references/references.json`
- `references/references.bib`
- incremental chapter files under `chapters/`
- PDF export target under `exports/`

## Source And Citation Requirements

- Download all available original PDFs or source files before drafting.
- Keep English original quotations in chapter quote ledgers.
- Add Chinese translation, why it matters, and investment implication for every important statement.
- Record missing source files as TODO references instead of silently skipping them.

## Incremental Update Design

Each chapter has stable frontmatter:

- `chapter_id`
- `ticker`
- `fiscal_period`
- `source_refs`
- `update_status`
- `last_updated`
- `next_refresh`
- `depends_on`

When Q4 arrives, refresh only chapters whose source dependencies changed.
