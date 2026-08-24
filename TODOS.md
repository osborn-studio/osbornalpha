# TODOS — Stock Monitor / Hiphon PM

## Deferred (from CEO review 2026-06-02, SCOPE EXPANSION)

### ~~[P2] Daily auto call-sheet~~ — SUPERSEDED 2026-06-12
- Superseded by Hermes cron `hiphon-weekly-pack`（周五 16:30 周度决策包，经 Hermes gateway 推 Telegram）。
  周频比日频更契合战绩成熟度与可转债/周频路线（见 Hedge Fund AI PRD）。

### [P3] Migrate hermes-agent repo to SSD
- **What:** `/Users/osborn/hermes-agent`（含 .venv）在内置盘，违反"代码住 SSD"全局规则。
  迁移到 `~/Developer/hermes-agent` 并重建 venv + launchd 路径。
- **Why:** 内置盘空间纪律。**Risk:** 运行中 gateway/venv/launchd plist 都指向旧路径，须一次性切换。
- **Effort:** S-M. **注意:** `hermes gateway start` 会重写 service 定义，可借此切换。

### [P3] Web integration — /hiphon chat page
- **What:** Surface John Cameron + pick/deepdive/track in the Next.js web app as a chat/drawer.
- **Why:** Faces end users beyond CLI.
- **Effort:** L. **Depends on:** CLI suite proven.

### [P2] Wire chokepoint-atlas Python research pipeline — PARTIAL (wrapper landed)
- **Done:** Pipeline verified pure-Python-stdlib (zero deps, runs green). Thin wrapper
  `skills/hiphon-pm/scripts/research-pack.sh` added (`compare`/`pack`/`pipeline`, graceful
  guards). Integration design at `docs/designs/chokepoint-pipeline-integration.md`.
- **Remaining:** Wire the agent loop — `hiphon-pm-pick`/`deepdive` emit a lane JSON from §11.2
  bottleneck reasoning → run `research-pack.sh` → read the scorecard/memos back to pick the lane.
  Keep agent-owned scoring (§11.6); pipeline only aggregates; `score-calls.sh` stays sole
  outcome adjudicator; sizing stays §5/§1.
- **Effort (remaining):** M. **Source:** fork github.com/gilosbornhello/chokepoint-atlas.
