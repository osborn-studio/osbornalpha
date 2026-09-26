# Calibration Refit Report (C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure calibration module plus a read-only script that turns the judgment ledger and its labels into §10.1 class ① metrics, isotonic fits, threshold proposals and §10.3 stop-rule verdicts, written as a dated JSON artifact and Markdown report.

**Architecture:** `src/lib/research/fanout/calibration.ts` builds on `report.ts` rows (`ReportRow`). No new tables; the artifact is a file. Threshold application stays a human commit to `questions.ts`.

**Tech Stack:** TypeScript, vitest.

Spec: `docs/superpowers/specs/2026-09-26-calibration-refit-design.md`.

---

### Task 1: isotonic + Wilson (TDD)
- Test: `calibration.test.ts` — PAV pools violators, is monotone, reproduces perfectly calibrated input; `applyIsotonic` interpolates within a segment and clamps outside; `wilson(k, n)` matches known values.
- RED → implement → GREEN → commit.

### Task 2: class metrics (TDD)
- Test: important recall (abstentions count as misses), false-support rate, per-question ECE before/after (cross-fitted; null under 30 labels), reuse of `summarize` numbers.
- RED → implement → GREEN → commit.

### Task 3: threshold proposals + stop rules (TDD)
- Test: Q1 feasible/infeasible search, Q2 min-confidence, Q3/Q4/Q5; `insufficient_labels`; stop rules per §10.3 with baseline comparison.
- RED → implement → GREEN → commit.

### Task 4: artifact, Markdown, script
- Test: artifact shape and determinism; Markdown contains tables and verdicts; script argument validation (pure runner with injected loader).
- `npm test`, typecheck, lint → commit → Codex review → PR → bind + Auto-fix.
