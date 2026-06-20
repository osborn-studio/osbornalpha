# Chokepoint-Atlas Pipeline Integration

Status: design + thin first slice (wrapper shipped). Owner: Hiphon PM.
Source fork: `forks/chokepoint-atlas/` (origin: github.com/gilosbornhello/chokepoint-atlas,
upstream: qiuqiubuchongle-cloud). Closes the design half of TODOS `[P2] Wire chokepoint-atlas
Python research pipeline`.

This doc describes how the forked Python research pipeline plugs into the Hiphon PM
method (`hiphon-pm-pick` / `hiphon-pm-deepdive`) without breaking doctrine §11.6's
scoring discipline, and which scripts are worth wiring first.

---

## 1. What the fork ships (verified by reading + running)

All scripts live in `forks/chokepoint-atlas/scripts/`. They are a small, layered
pipeline that turns structured JSON describing a "lane" (a supply-chain bottleneck
thesis) into a deterministic research pack: scorecard + graph + evidence trace + memos.

| Script | Role | Input | Output | Deps |
|---|---|---|---|---|
| `build_research_pack.py` | **Core engine.** Validates a single lane input, normalizes evidence (A/B/C/D → Confirmed/Inferred/Weak/Needs-verification), averages the 5-dim company scores into a lane score, builds the node/edge graph + mermaid, ranks top names, writes scorecard + memos. | One lane JSON (`meta`, `thesis`, `stack_layers`, `bottlenecks`, `evidence`, `companies`, `catalysts`). Example: `examples/ai_factory_lane_input.json` | dir with `research_pack.json`, `scorecard.json`, `graph.json` + `.mmd`, `evidence_trace.json`, and 6 `.md` memos (quick_scan, evidence_memo, evidence_trace, graph_card, catalyst_watch, graph_mermaid). | **stdlib only** (`json`, `argparse`, `pathlib`, `statistics`). |
| `compare_lanes.py` | **Lane ranker.** Calls the core engine per lane, sorts by `total_average`, emits a ranked table + compare memo. This is the §11.2-step-3 "which lane gets the next block of research time" tool. | JSON with top-level `lanes: [...]` array (each element = a `build_research_pack` lane). Example: `examples/lane_compare_input.json` (2 lanes). | dir with `lane_ranking.json`, `lane_details.json`, `ranked_lane_table.md`, `lane_compare_memo.md`. | stdlib only (imports the core engine). |
| `extract_sources_to_pack.py` | **Source ingester.** Turns a raw "source bundle" (titles + bodies + source_type) into a draft lane pack: assigns evidence tiers from `source_type`, regex-extracts signals (HBM, AI, packaging, cooling, ramp…), pulls quote snippets, and *infers* per-company 1–5 scores from those signals (heuristic). | JSON with `meta`, `thesis`, `stack_layers`, `bottlenecks`, `companies`, `sources`. Example: `examples/source_bundle_input.json` (4 sources, 3 companies). | `draft_pack_input.json` + `extraction_report.json`. The draft then feeds the core engine. | stdlib only (`json`, `argparse`, `re`, `pathlib`). |
| `run_source_pipeline.py` | **End-to-end glue.** `extract_sources_to_pack` → `build_research_pack` in one call. Writes `01_draft/` + `02_final_pack/`. | A source bundle (same as `extract_sources_to_pack`). | Both stages' outputs under one dir. | stdlib only (imports the two above). |
| `generate_infographics.py` | Cosmetic. Renders 3 fixed Chinese marketing PNGs. | none (hardcoded). | PNGs. | **Pillow** + macOS-specific hardcoded font paths + a hardcoded `/Users/windows/...` output dir. |

### Dependency story (the good news)
The four research scripts are **pure Python 3.11 stdlib** — no `requirements.txt`,
no `pip install` needed. They import only `json`, `argparse`, `re`, `pathlib`,
`statistics`. There is no `requirements.txt`/`pyproject.toml` in the fork because
none is needed for the research path.

`generate_infographics.py` is the only script with a real dependency (Pillow) and it
is **not part of the research path** — it has hardcoded `/Users/windows/...` paths and
macOS-only font asset paths, so it is explicitly **out of scope** for integration.

### Run-attempt result (actually executed)
Run from the fork root with `PYTHONPATH=scripts` (scripts use sibling imports like
`from build_research_pack import ...`, so the `scripts/` dir must be importable):

```
PYTHONPATH=scripts python3 scripts/build_research_pack.py  --input examples/ai_factory_lane_input.json --output /tmp/out/brp   # exit 0, 12 files
PYTHONPATH=scripts python3 scripts/compare_lanes.py        --input examples/lane_compare_input.json    --output /tmp/out/cmp   # exit 0, 4 files
PYTHONPATH=scripts python3 scripts/run_source_pipeline.py  --input examples/source_bundle_input.json   --output /tmp/out/pipe  # exit 0, 14 files
```

All three exited 0 against their example inputs on the dev box (Python 3.11.15, no venv,
no installs). Spot-checked output: `scorecard.json` lane block produces e.g.
`total_average: 3.5 → "Watch closely"`, top names `["CAMT","FORM","ICHR"]`, and a
quick-scan memo with the thesis, stack, strongest evidence, and lane score — exactly the
artifacts Hiphon PM wants.

---

## 2. The scoring contract: how this stays consistent with doctrine §11.6

This is the load-bearing constraint. Doctrine §11.6 defines the 5-dim framework
(Constraint / Evidence / Consensus / Mispricing / Catalyst, each 1–5) and lays down the
iron rule: **打分不是假精确，不是交易信号** — the score only compares lanes / compares names
within a lane / explains where the next research block goes. Final position sizing is
still adjudicated by doctrine §5 (conviction / execution certainty) + §1 (macro master
switch).

The fork's engine is faithful to §11.6 **by construction**:

- The five score fields in `build_research_pack.py` (`SCORE_FIELDS`) are exactly §11.6's
  five dimensions, same names, same 1–5 range (validated: `validate_score` rejects
  anything outside 1–5).
- Lane score = arithmetic mean of the per-company dimension means (`average_company_scores`),
  then `lane_priority()` buckets it: `>=4.2` Very-high, `>=3.6` High, `>=3.0` Watch,
  else Lower-priority. This is a presentation bucketing, **not** a sizing signal — it
  matches §11.6's "compare lanes, don't pretend it's a trading signal."
- Name score = mean of the same five dims per company (`compute_name_average`), used only
  to rank `top_names`. §11.6's Name Score adds "栈内角色 + 风险" as qualitative context;
  the fork carries `role`, `stack_layer`, `risk` straight through into the scorecard, so
  no information is lost.

**Consistency rules for the integration (must hold):**

1. **Hiphon PM owns the scores, the pipeline only aggregates them.** The deterministic
   path is `build_research_pack` / `compare_lanes`, where the agent supplies each company's
   five 1–5 scores per §11.6 reasoning. The pipeline must never become the *source* of
   conviction.
2. **`extract_sources_to_pack.py`'s inferred scores are a DRAFT, never a verdict.** Its
   heuristic (signals → scores) is fine as a first-pass straw man, but the agent must
   re-rate every dimension against §11.6 before the pack is treated as real. Treat the
   `draft_pack_input.json` as an editable intermediate, not a final.
3. **The pack feeds research, not sizing.** The research pack → agent reads
   `quick_scan.md` / `lane_compare_memo.md` / `scorecard.json` to decide *where to dig*.
   Position sizing still routes through doctrine §5 + §1. The pipeline output carries no
   size, no entry, no stop — and the existing `score-calls.sh` track-record scorer remains
   the only thing that adjudicates call outcomes.
4. **One scoring source of truth.** The fork's `references/scoring-framework.md` is already
   internalized into doctrine §11.6 (§11.7). If §11.6 ever changes the dimensions or the
   priority buckets, the divergence must be noted here — the fork must not be edited (it is
   a separate repo / upstreamable). If they drift, the wrapper/agent layer adapts, not the fork.

---

## 3. How Hiphon PM invokes the pipeline

Data flow (bottleneck method → research pack → agent consumes):

```
hiphon-pm-pick / hiphon-pm-deepdive
  │  (agent runs the §11.2 method: supertrend → end system → stack → bottleneck)
  ▼
agent emits a LANE JSON  (meta/thesis/stack_layers/bottlenecks/evidence/companies/catalysts,
  with each company carrying its five §11.6 scores)         ── OR ──  a SOURCE BUNDLE JSON
  ▼                                                                     ▼
build_research_pack.py  (single lane)                        extract_sources_to_pack.py → build_research_pack
compare_lanes.py        (lanes: [...] for ranking)           (= run_source_pipeline.py)
  ▼
research pack dir: scorecard.json + quick_scan.md + lane_compare_memo.md + graph.* + evidence_trace.*
  ▼
agent READS the pack back in → cites evidence_trace, ranks lanes by scorecard, picks the
  lane that "deserves the next block of research time" → continues §11.2 deepdive / name selection
```

The agent is both the producer (writes the JSON input from its bottleneck reasoning) and
the consumer (reads the deterministic scorecard/memos back). The pipeline's only job is to
be the **deterministic middle**: validation, evidence normalization, score aggregation,
graph + memo rendering. That determinism is the value — it removes "fake precision" drift
between runs.

### Which scripts to wire first (recommended order)
1. **`compare_lanes.py`** — highest leverage, lowest risk. It is the §11.2-step-3 lane
   ranker, the exact gap §11.6 fills, and it exercises the core engine. Input is the
   cleanest (agent-authored lanes). **This is the first slice.**
2. **`build_research_pack.py`** — single-lane deepdive pack for `hiphon-pm-deepdive`.
   Same engine, narrower input.
3. **`run_source_pipeline.py` / `extract_sources_to_pack.py`** — only after source
   ingestion is designed. Its inferred scores need the §11.6 re-rating guard (rule §2.2),
   so it carries the most "consistency" risk and should come last.
4. **`generate_infographics.py`** — do NOT wire. Marketing-only, Pillow + hardcoded paths.

---

## 4. Runtime story

- **Interpreter:** system `python3` (3.11+ verified). No venv required for the research
  path because there are no third-party deps.
- **Invocation quirk:** scripts use sibling imports, so they must run with the fork's
  `scripts/` dir on `PYTHONPATH` (or `cwd` = fork root with `PYTHONPATH=scripts`). The
  wrapper handles this.
- **Fork location:** discovered relative to the wrapper, or overridable via
  `CHOKEPOINT_ATLAS_DIR`, so the integration survives the fork moving.
- **No network, no secrets.** Unlike `score-calls.sh`, this pipeline is pure local
  transform — no API calls, no `STOCK_MONITOR_SITE_PASSWORD`.
- **Graceful degradation:** if `python3` is absent, the wrapper fails with a clear message
  and a non-zero exit rather than a stack trace (deps for the research path are stdlib, so
  the only real failure mode is "no python3" or "fork not found").

---

## 5. First slice shipped

`skills/hiphon-pm/scripts/research-pack.sh` — a thin, dependency-guarded wrapper that
forwards to the fork pipeline. It:
- locates the fork (`CHOKEPOINT_ATLAS_DIR` env or relative default),
- guards on `python3` presence and the fork's existence with clear errors,
- sets `PYTHONPATH` so sibling imports resolve,
- dispatches to `compare` / `pack` / `pipeline` subcommands (mapping to the three research
  scripts), and
- documents the §11.6 consistency rules inline so callers don't treat the output as a
  trading signal.

It deliberately does **not** modify the fork and does **not** wrap the infographics script.

### Deferred / out of scope
- Agent-side prompt wiring (teaching `hiphon-pm-pick`/`deepdive` to emit the lane JSON and
  read the pack back) — needs the skill files, which another agent is auditing.
- Source-bundle ingestion design + the §11.6 re-rating guard for inferred scores.
- A JSON-schema doc for the lane input (currently the engine's `validate_input` is the spec).
