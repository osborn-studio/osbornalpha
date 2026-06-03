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
