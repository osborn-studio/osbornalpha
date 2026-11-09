#!/usr/bin/env bash
# Launch an isolated osbornalpha verification instance:
#   - `next dev` on $OSB_PORT in guest mode (Supabase env empty → auth gate off, search uses developer fallback)
#   - headless Chrome with its own throwaway profile, CDP on $OSB_CDP_PORT
#   - a fresh evidence dir $OSB_EVIDENCE_ROOT/verify-<timestamp>/
# Usage: scripts/launch.sh            (guest mode, default)
#        OSB_MODE=gate scripts/launch.sh   (auth-gate mode: points Supabase at a closed local port so every
#                                          request is "signed out"; see features/auth-gate.md)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
OSB_MODE="${OSB_MODE:-guest}"

if [ -f "$OSB_RUN_DIR/next.pid" ] && kill -0 "$(cat "$OSB_RUN_DIR/next.pid")" 2>/dev/null; then
  echo "launch: an instance from $OSB_RUN_DIR is already running; run scripts/cleanup.sh first" >&2; exit 1
fi
for p in "$OSB_PORT" "$OSB_CDP_PORT"; do
  if osb_port_busy "$p"; then echo "launch: port $p is already in use by someone else; pick another OSB_PORT/OSB_CDP_PORT" >&2; exit 1; fi
done
# `next dev` writes to <repo>/.next; a second dev server in the same checkout would share it.
if pgrep -f "next dev" -u "$(id -u)" >/dev/null && pgrep -af "next dev" | grep -q "$REPO_ROOT"; then
  echo "launch: WARNING another 'next dev' appears to run in this checkout; both share .next/ — prefer a separate worktree" >&2
fi

mkdir -p "$OSB_RUN_DIR/chrome-profile"
EVIDENCE_DIR="$OSB_EVIDENCE_ROOT/verify-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$EVIDENCE_DIR"
echo "$EVIDENCE_DIR" > "$OSB_RUN_DIR/evidence_dir"
echo "$OSB_MODE" > "$OSB_RUN_DIR/mode"
git -C "$REPO_ROOT" rev-parse HEAD > "$OSB_RUN_DIR/product_sha"

if [ ! -d "$REPO_ROOT/node_modules/next" ]; then
  echo "launch: installing deps (npm ci) with node $(node -v)"
  (cd "$REPO_ROOT" && npm ci --no-audit --no-fund) > "$OSB_RUN_DIR/npm-ci.log" 2>&1
fi

# An empty inherited value takes precedence over Next.js dotenv files.
# Unsetting would allow a checkout's .env.local to configure a real Supabase.
SB_URL=''
SB_ANON_KEY=''
if [ "$OSB_MODE" = gate ]; then
  SB_URL=http://127.0.0.1:54399
  SB_ANON_KEY=verify-dummy-anon-key
fi
ENV_ARGS=("NEXT_PUBLIC_SUPABASE_URL=$SB_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SB_ANON_KEY"
  SUPABASE_SERVICE_ROLE_KEY= NEXT_TELEMETRY_DISABLED=1)

cd "$REPO_ROOT"
setsid env "${ENV_ARGS[@]}" npx next dev -p "$OSB_PORT" > "$OSB_RUN_DIR/next.log" 2>&1 < /dev/null &
echo $! > "$OSB_RUN_DIR/next.pid"

CHROME="$(osb_chrome)" || { echo "launch: no chrome/chromium found (set OSB_CHROME)" >&2; exit 1; }
# Headless one-shot --screenshot hangs on this kind of box; always drive over CDP instead.
setsid "$CHROME" --headless=new --remote-debugging-address=127.0.0.1 --remote-debugging-port="$OSB_CDP_PORT" \
  --user-data-dir="$OSB_RUN_DIR/chrome-profile" --no-first-run --no-default-browser-check --disable-gpu \
  --window-size=1440,900 about:blank > "$OSB_RUN_DIR/chrome.log" 2>&1 < /dev/null &
echo $! > "$OSB_RUN_DIR/chrome.pid"

# Ready = landing page renders the brand (first compile takes 5-60s), and CDP answers.
for i in $(seq 1 120); do
  # (capture first: `curl | grep -q` under pipefail fails on SIGPIPE even when the page is fine)
  page="$(curl -fsS -m 30 "$OSB_BASE_URL/" 2>/dev/null || true)"
  if [[ "$page" == *osbornalpha* ]] && curl -fsS -m 2 "$OSB_CDP_URL/json/version" >/dev/null 2>&1; then
    echo "launch: READY mode=$OSB_MODE app=$OSB_BASE_URL cdp=$OSB_CDP_URL"
    echo "launch: evidence dir $EVIDENCE_DIR"
    exit 0
  fi
  if ! kill -0 "$(cat "$OSB_RUN_DIR/next.pid")" 2>/dev/null; then echo "launch: next dev exited; see $OSB_RUN_DIR/next.log" >&2; tail -20 "$OSB_RUN_DIR/next.log" >&2; exit 1; fi
  sleep 2
done
echo "launch: not ready after 240s; see $OSB_RUN_DIR/next.log and chrome.log" >&2
exit 1
