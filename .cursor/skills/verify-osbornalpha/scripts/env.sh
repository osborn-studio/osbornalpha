# Sourced by the other helpers. Do not execute directly.
# Shared settings for one verification instance. Override via env before calling.
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
OSB_PORT="${OSB_PORT:-3107}"                 # Next dev server port (not 3000: keep clear of a human's dev server)
OSB_CDP_PORT="${OSB_CDP_PORT:-9333}"         # headless Chrome remote-debugging port
OSB_RUN_DIR="${OSB_RUN_DIR:-/tmp/osbornalpha-verify-$OSB_PORT}"   # pids, logs, chrome profile (scratch; removed by cleanup)
OSB_EVIDENCE_ROOT="${OSB_EVIDENCE_ROOT:-$HOME/osbornalpha-verify-evidence}"  # proof artifacts (survive cleanup)
OSB_BASE_URL="http://127.0.0.1:$OSB_PORT"
OSB_CDP_URL="http://127.0.0.1:$OSB_CDP_PORT"

# package.json pins node ">=22.19.0 <23". Prefer an explicit OSB_NODE22_BIN, then a
# node22 found on PATH or in ~/.local/node22, else whatever `node` is (doctor warns).
osb_pick_node() {
  local c
  for c in "${OSB_NODE22_BIN:-}" "$HOME/.local/node22/bin" "$(dirname "$(command -v node 2>/dev/null || echo /x/node)")"; do
    [ -n "$c" ] && [ -x "$c/node" ] && "$c/node" -v 2>/dev/null | grep -q '^v22\.' && { echo "$c"; return; }
  done
  dirname "$(command -v node)"
}
OSB_NODE_BIN_DIR="$(osb_pick_node)"
export PATH="$OSB_NODE_BIN_DIR:$PATH"

osb_chrome() {
  local c
  for c in "${OSB_CHROME:-}" google-chrome google-chrome-stable chromium chromium-browser; do
    [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }
  done
  return 1
}

osb_port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
