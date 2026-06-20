#!/usr/bin/env bash
# install.sh — link Hiphon PM skills into the running Hermes Agent.
#
# Symlinks (not copies) each hermes/skills/<name> into ~/.hermes/skills/finance/,
# so the repo stays the single source of truth: git pull in stock-monitor and
# Hermes picks up the new skill text immediately. Idempotent; --uninstall removes.
set -euo pipefail

REPO_SKILLS="$(cd "$(dirname "$0")/skills" && pwd)"
HERMES_SKILLS="${HERMES_SKILLS_DIR:-$HOME/.hermes/skills}/finance"
SKILLS=(hiphon-pm hiphon-pm-pick hiphon-pm-track hiphon-pm-deepdive)

if [ "${1:-}" = "--uninstall" ]; then
  for s in "${SKILLS[@]}"; do
    [ -L "$HERMES_SKILLS/$s" ] && rm "$HERMES_SKILLS/$s" && echo "removed $s"
  done
  exit 0
fi

[ -d "$HOME/.hermes" ] || { echo "ERROR: ~/.hermes not found — is Hermes Agent installed?" >&2; exit 1; }
mkdir -p "$HERMES_SKILLS"

for s in "${SKILLS[@]}"; do
  src="$REPO_SKILLS/$s"
  dst="$HERMES_SKILLS/$s"
  [ -f "$src/SKILL.md" ] || { echo "ERROR: $src/SKILL.md missing" >&2; exit 1; }
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "ERROR: $dst exists and is not a symlink — refusing to overwrite" >&2; exit 1
  fi
  ln -sfn "$src" "$dst"
  echo "linked $s -> $src"
done

echo "OK: ${#SKILLS[@]} Hiphon PM skills linked into $HERMES_SKILLS"
echo "Verify with: hermes skills list | grep hiphon"
