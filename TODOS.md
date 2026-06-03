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

### [P2] Wire chokepoint-atlas Python research pipeline
- **What:** The forked `forks/chokepoint-atlas/scripts/` ships a real pipeline
  (`build_research_pack.py`, `run_source_pipeline.py`, `compare_lanes.py`,
  `extract_sources_to_pack.py`, `generate_infographics.py`) + `graph-schema.md` +
  example JSON inputs. Wire it as a callable research tool for `hiphon-pm-pick` /
  `hiphon-pm-deepdive` (produce a structured research pack + lane comparison).
- **Why:** Turns the bottleneck method from prose into a reproducible source→pack pipeline.
- **Effort:** M-L. **Notes:** Python deps + source ingestion; keep the deterministic
  scoring (scoring-framework.md) consistent with doctrine §11.6. Method already
  internalized (doctrine §11); this adds the automated tooling layer.
- **Source:** fork github.com/gilosbornhello/chokepoint-atlas (upstream qiuqiubuchongle-cloud).
