# TODOS — Stock Monitor / Hiphon PM

## Deferred (from CEO review 2026-06-02, SCOPE EXPANSION)

### [P2] Daily auto call-sheet (John Cameron morning push)
- **What:** Reuse `/api/cron/daily-brief` + telegram/resend to auto-push a morning
  call sheet: overnight macro change, actions on current holdings, 1-2 fresh buys
  with size+stop, and a one-line 30-day track-record summary.
- **Why:** Gets the PM in front of you daily without asking.
- **Blocked by:** Call journal + self-scoring track record must be stable first
  (distribution before maturity = pushing unaccountable calls louder).
- **Effort:** S-M (CC ~30 min). **Depends on:** hiphon-pm-track.

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
