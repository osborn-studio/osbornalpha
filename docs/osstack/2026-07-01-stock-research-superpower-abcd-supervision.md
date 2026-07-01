# Stock Research Superpower A/B/C/D Supervision

Date: 2026-07-01
osstack card: `card_28153cca`
Branch: `codex/stock-research-abcd`

## Objective

Complete the next Stock Research Superpower phase so B/C/A/D are all represented by executable workflow references and deterministic benchmark fixtures.

## Scope

- B: industry/theme to investable stock candidates
- C: daily/weekly research dashboard
- A: single-stock institutional research book
- D: PM decision pack

## Acceptance Gates

- `node scripts/score-stock-research-superpower.mjs --benchmark skills/stock-research-superpower/evals/benchmark.json --self-check`
- `node scripts/score-stock-research-superpower.mjs --benchmark skills/stock-research-superpower/evals/benchmark.json --score-fixtures`
- `npm test`
- `npm run typecheck`
- `npm run build`

## Completion Checklist

- [x] Register fixtures for A/B/C/D in `evals/benchmark.json`.
- [x] Add pass fixture for A single-stock research book.
- [x] Add pass fixture for C daily research dashboard.
- [x] Add pass fixture for D PM decision pack.
- [x] Extend scorer with all-fixture scoring.
- [x] Strengthen A workflow into executable stages and minimum output.
- [x] Strengthen C workflow into executable stages and minimum output.
- [x] Strengthen D workflow into executable stages and minimum output.
- [x] Extend output contracts for A/C/D.
- [x] Add tracked `earnings-research-book` skill entrypoint for A.
- [x] Run full acceptance gates.
- [ ] Commit, push, PR, deploy.
