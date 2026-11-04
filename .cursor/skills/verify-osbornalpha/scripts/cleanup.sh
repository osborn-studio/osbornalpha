#!/usr/bin/env bash
# Tear down what launch.sh started (by recorded pid / process group, never by name),
# copy server+browser logs into the evidence dir, then delete scratch state.
# Evidence under $OSB_EVIDENCE_ROOT is never deleted.
# Usage: scripts/cleanup.sh
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
[ -d "$OSB_RUN_DIR" ] || { echo "cleanup: nothing at $OSB_RUN_DIR"; exit 0; }
ev="$(cat "$OSB_RUN_DIR/evidence_dir" 2>/dev/null || true)"
if [ -n "$ev" ] && [ -d "$ev" ]; then
  mkdir -p "$ev/logs"; cp "$OSB_RUN_DIR"/*.log "$ev/logs/" 2>/dev/null || true
fi
for n in chrome next; do
  pid="$(cat "$OSB_RUN_DIR/$n.pid" 2>/dev/null || true)"
  [ -z "$pid" ] && continue
  # launch.sh used setsid, so pid == process-group id: kill the whole group we created.
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$pid" 2>/dev/null || true
  echo "cleanup: stopped $n (pgid $pid)"
done
rm -rf "$OSB_RUN_DIR"
for p in "$OSB_PORT" "$OSB_CDP_PORT"; do osb_port_busy "$p" && echo "cleanup: WARNING port $p still busy (not ours?)"; done
[ -n "$ev" ] && { [ -d "$ev" ] && echo "cleanup: evidence kept at $ev" || echo "cleanup: WARNING evidence dir $ev missing"; }
exit 0
