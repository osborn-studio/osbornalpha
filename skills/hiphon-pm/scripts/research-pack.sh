#!/usr/bin/env bash
# research-pack.sh — thin wrapper around the forked chokepoint-atlas research pipeline.
#
# Turns a Hiphon PM bottleneck thesis (structured JSON) into a deterministic research
# pack: scorecard + lane ranking + graph + evidence trace + memos. The fork is a SEPARATE
# repo (forks/chokepoint-atlas, upstream qiuqiubuchongle-cloud) — this wrapper only
# FORWARDS to it, it never edits it. See docs/designs/chokepoint-pipeline-integration.md.
#
# Scoring discipline (doctrine §11.6): the five dims (Constraint/Evidence/Consensus/
# Mispricing/Catalyst, 1–5) are supplied BY THE AGENT in the input JSON. The pipeline only
# AGGREGATES and ranks them — it is NOT a trading signal and carries no position size.
# Final sizing stays with doctrine §5 (conviction) + §1 (macro). The `pipeline` subcommand's
# inferred scores are a DRAFT and must be re-rated against §11.6 before they count.
#
# Requires: python3 (3.11+). The research path uses ONLY the Python stdlib — no pip install.
#   (generate_infographics.py needs Pillow + macOS fonts; it is intentionally NOT wrapped.)
set -euo pipefail

# --- locate the fork ---------------------------------------------------------
# Override with CHOKEPOINT_ATLAS_DIR; default walks up from this script
# (stock-monitor/skills/hiphon-pm/scripts/) to 01_active/, where forks/ lives as a sibling
# of stock-monitor/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_FORK="$(cd "$SCRIPT_DIR/../../../.." 2>/dev/null && pwd)/forks/chokepoint-atlas"
FORK_DIR="${CHOKEPOINT_ATLAS_DIR:-$DEFAULT_FORK}"

usage() {
  cat >&2 <<EOF
usage: research-pack.sh <command> --input <in.json> --output <dir>

commands:
  compare    rank multiple lanes        (compare_lanes.py)        input: {"lanes":[...]}
  pack       single-lane research pack   (build_research_pack.py)  input: one lane object
  pipeline   source bundle -> draft -> pack (run_source_pipeline.py) input: source bundle
             NOTE: pipeline's per-company scores are HEURISTIC drafts — re-rate per §11.6.

env:
  CHOKEPOINT_ATLAS_DIR   path to the fork (default: $DEFAULT_FORK)

Input shapes are specified by the engine's validate_input(); see the fork's
examples/*.json and docs/designs/chokepoint-pipeline-integration.md.
EOF
  exit 2
}

# --- dependency / fork guards (graceful failure, not a stack trace) ----------
command -v python3 >/dev/null 2>&1 || {
  echo "ERROR: python3 not found. The chokepoint-atlas research pipeline requires python3 (3.11+)." >&2
  echo "       The research path needs no pip packages (stdlib only); just install python3." >&2
  exit 1
}

[ -d "$FORK_DIR/scripts" ] || {
  echo "ERROR: chokepoint-atlas fork not found at: $FORK_DIR" >&2
  echo "       Set CHOKEPOINT_ATLAS_DIR to the fork checkout (must contain scripts/)." >&2
  exit 1
}

# --- dispatch ----------------------------------------------------------------
[ $# -ge 1 ] || usage
CMD="$1"; shift

case "$CMD" in
  compare)  PY_SCRIPT="compare_lanes.py" ;;
  pack)     PY_SCRIPT="build_research_pack.py" ;;
  pipeline) PY_SCRIPT="run_source_pipeline.py" ;;
  -h|--help|help) usage ;;
  *) echo "ERROR: unknown command '$CMD'" >&2; usage ;;
esac

[ -f "$FORK_DIR/scripts/$PY_SCRIPT" ] || {
  echo "ERROR: expected script missing: $FORK_DIR/scripts/$PY_SCRIPT" >&2
  exit 1
}

# Scripts use sibling imports (from build_research_pack import ...), so scripts/ must be
# importable. Forward all remaining args (--input/--output) straight through.
PYTHONPATH="$FORK_DIR/scripts${PYTHONPATH:+:$PYTHONPATH}" \
  exec python3 "$FORK_DIR/scripts/$PY_SCRIPT" "$@"
