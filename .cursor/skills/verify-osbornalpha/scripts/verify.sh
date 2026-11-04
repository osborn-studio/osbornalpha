#!/usr/bin/env bash
# One-shot: launch → doctor → drive → cleanup (cleanup always runs, evidence always kept).
# Usage: scripts/verify.sh [journey...|all]          (guest mode)
#        OSB_MODE=gate scripts/verify.sh all          (auth-gate mode)
# Exit code = drive's exit code (0 only if every check passed).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/env.sh"
trap '"$here/cleanup.sh"' EXIT
"$here/launch.sh" || exit 1
"$here/doctor.sh" || exit 1
ev="$(cat "$OSB_RUN_DIR/evidence_dir")"
node "$here/drive.mjs" "${@:-all}"; rc=$?
echo "verify: drive exit $rc; evidence at $ev"
exit $rc
