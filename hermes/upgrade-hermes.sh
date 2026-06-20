#!/usr/bin/env bash
# upgrade-hermes.sh — auto-upgrade the Hermes Agent core with smoke test + rollback.
#
# Strategy: wrap the OFFICIAL `hermes update` (upstream's own pull+reinstall path)
# rather than raw git surgery; our value-add is the safety loop around it:
#   check -> snapshot SHA -> update -> smoke test -> rollback on failure -> notify.
# We never fork or vendor Hermes, so every upstream improvement is absorbed as-is.
# Never touches ~/.hermes (user state/memory/credentials) or ~/.hiphon-pm.
#
# Usage:  upgrade-hermes.sh [--dry-run]      # --dry-run = check only, no install
# Env:    HERMES_REPO (default /Users/osborn/hermes-agent)
#         HERMES_BIN  (default $HERMES_REPO/.venv/bin/hermes)
#         HIPHON_NOTIFY=0 to silence `hermes send` notifications
set -uo pipefail   # no -e: we handle errors explicitly for the rollback path

HERMES_REPO="${HERMES_REPO:-/Users/osborn/hermes-agent}"
HERMES_BIN="${HERMES_BIN:-$HERMES_REPO/.venv/bin/hermes}"
LOG_PREFIX="[upgrade-hermes $(date '+%F %T')]"

say()    { echo "$LOG_PREFIX $*"; }
notify() {
  [ "${HIPHON_NOTIFY:-1}" = "0" ] && return 0
  "$HERMES_BIN" send "🛠 Hermes 升级: $*" >/dev/null 2>&1 || true   # best-effort, home channel
}

[ -x "$HERMES_BIN" ] || { say "FATAL: hermes binary not found at $HERMES_BIN"; exit 1; }
[ -d "$HERMES_REPO/.git" ] || { say "FATAL: $HERMES_REPO is not a git repo"; exit 1; }

# ── 1. Check for updates (official) ─────────────────────────────
CHECK_OUT="$("$HERMES_BIN" update --check 2>&1)" || true
if echo "$CHECK_OUT" | grep -qiE "up.to.date|already.*latest|no update"; then
  say "already up to date — nothing to do"
  exit 0
fi
say "update available:"; echo "$CHECK_OUT" | head -5

if [ "${1:-}" = "--dry-run" ]; then
  say "dry-run: stopping before install"
  exit 0
fi

# ── 2. Snapshot for rollback ────────────────────────────────────
OLD_SHA="$(git -C "$HERMES_REPO" rev-parse HEAD)"
OLD_VER="$("$HERMES_BIN" --version 2>/dev/null | head -1 || echo unknown)"
say "snapshot: $OLD_VER @ ${OLD_SHA:0:9}"

# ── 3. Official update (pull + reinstall deps) ──────────────────
if ! "$HERMES_BIN" update --yes 2>&1 | tail -15; then
  say "hermes update FAILED — rolling back"
  git -C "$HERMES_REPO" reset --hard "$OLD_SHA" >/dev/null 2>&1
  "$HERMES_BIN" update --yes --force >/dev/null 2>&1 || true   # re-sync deps at old SHA
  notify "❌ 升级失败（update 命令出错），已回滚到 ${OLD_SHA:0:9}"
  exit 1
fi
NEW_SHA="$(git -C "$HERMES_REPO" rev-parse HEAD)"

# ── 4. Smoke tests ──────────────────────────────────────────────
smoke_fail=""
NEW_VER="$("$HERMES_BIN" --version 2>/dev/null | head -1)" || smoke_fail="version-check"
if [ -z "$smoke_fail" ]; then
  SKILLS_OUT="$("$HERMES_BIN" skills list 2>/dev/null)" || smoke_fail="skills-list"
  if [ -z "$smoke_fail" ]; then
    N_HIPHON="$(echo "$SKILLS_OUT" | grep -c "hiphon" || true)"
    [ "$N_HIPHON" -ge 4 ] || smoke_fail="hiphon-skills-missing($N_HIPHON/4)"
  fi
fi
if [ -z "$smoke_fail" ]; then
  "$HERMES_BIN" status >/dev/null 2>&1 || smoke_fail="status-check"
fi

# ── 5. Verdict: keep or roll back ───────────────────────────────
if [ -n "$smoke_fail" ]; then
  say "SMOKE TEST FAILED ($smoke_fail) — rolling back ${NEW_SHA:0:9} -> ${OLD_SHA:0:9}"
  git -C "$HERMES_REPO" reset --hard "$OLD_SHA" >/dev/null 2>&1
  "$HERMES_BIN" update --yes --force >/dev/null 2>&1 || true
  notify "❌ 升级烟测失败（$smoke_fail），已回滚到 $OLD_VER"
  exit 1
fi

say "SUCCESS: $OLD_VER -> $NEW_VER (${OLD_SHA:0:9} -> ${NEW_SHA:0:9})"
notify "✅ 已升级: $OLD_VER → $NEW_VER · hiphon 技能 ${N_HIPHON}/4 在线"
exit 0
