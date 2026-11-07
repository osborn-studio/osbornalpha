# Codex review — Task 7, commit 2ca2be0 (gpt-6-astra, medium; final message only, raw log not committed)

Artifact provenance verification incorrectly assumes raw hashes uniquely identify concepts. This causes valid CN facts and their derived metric inputs to fail verification.

Review comment:

- [P1] Disambiguate snapshot candidates by concept as well as hash — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/adapters/provenance.ts:117-118
  For Tushare snapshots, `parseTushareStatements` assigns the same locator and `rawHash` to every concept extracted from a statement row. Selecting the first candidate by hash therefore returns the wrong concept for all other facts from that row, causing `candidateMismatch` to report `candidate_mismatch:concept` despite valid provenance. This also fails verification of derived metrics using those facts. Pass the stored fact's concept into `locate` and include it in candidate selection; add a CN snapshot test containing multiple concepts from one row.
Artifact provenance verification incorrectly assumes raw hashes uniquely identify concepts. This causes valid CN facts and their derived metric inputs to fail verification.

Review comment:

- [P1] Disambiguate snapshot candidates by concept as well as hash — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/adapters/provenance.ts:117-118
  For Tushare snapshots, `parseTushareStatements` assigns the same locator and `rawHash` to every concept extracted from a statement row. Selecting the first candidate by hash therefore returns the wrong concept for all other facts from that row, causing `candidateMismatch` to report `candidate_mismatch:concept` despite valid provenance. This also fails verification of derived metrics using those facts. Pass the stored fact's concept into `locate` and include it in candidate selection; add a CN snapshot test containing multiple concepts from one row.
