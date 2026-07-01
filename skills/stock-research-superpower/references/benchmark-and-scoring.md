# Benchmark And Scoring

Use the benchmark when changing the skill pack or judging whether an output is good enough.

## Files

- `evals/benchmark.json`: benchmark cases, required phrases, forbidden phrases, and scoring rubric.
- `scripts/score-stock-research-superpower.mjs`: deterministic checker for benchmark schema and markdown outputs.

## Commands

Self-check the benchmark:

```bash
node scripts/score-stock-research-superpower.mjs --benchmark skills/stock-research-superpower/evals/benchmark.json --self-check
```

Score one answer against a case:

```bash
node scripts/score-stock-research-superpower.mjs --benchmark skills/stock-research-superpower/evals/benchmark.json --case B-ai-optical-modules --answer /path/to/answer.md
```

## Score Meaning

- 90-100: excellent; output is reusable as a strong research artifact.
- 80-89: pass; output is good enough but likely needs analyst polishing.
- 60-79: incomplete; workflow shape is visible but important requirements are missing.
- below 60: fail; do not treat as completed research.

## Rubric

- Workflow routing: 10
- Required output structure: 20
- Evidence discipline: 25
- Research logic: 25
- Guardrails: 10
- Actionability: 10

Passing requires both:

- total score at least `passing_score`
- no forbidden phrase hits

## TDD Use

Before modifying the skill pack, add or update benchmark cases for the behavior being changed. Run self-check before implementation. After implementation, score at least one representative answer or dry-run artifact.
