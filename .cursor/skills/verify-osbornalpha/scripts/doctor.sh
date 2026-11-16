#!/usr/bin/env bash
# Read-only health check: "is this instance worth driving?" Exit 0 = yes.
# Usage: scripts/doctor.sh
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
fail=0
ok()  { echo "  ok   $*"; }
bad() { echo "  FAIL $*"; fail=1; }
echo "doctor: repo=$REPO_ROOT port=$OSB_PORT cdp=$OSB_CDP_PORT run=$OSB_RUN_DIR"
echo "  info git $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null)"
v="$(node -v 2>/dev/null)"; case "$v" in v22.*) ok "node $v";; *) bad "node $v (package.json wants >=22.19 <23; set OSB_NODE22_BIN)";; esac
[ -d "$REPO_ROOT/node_modules/next" ] && ok "node_modules present" || bad "node_modules missing (launch.sh runs npm ci)"
mode="$(cat "$OSB_RUN_DIR/mode" 2>/dev/null || echo '?')"; echo "  info mode=$mode"
for n in next chrome; do
  pid="$(cat "$OSB_RUN_DIR/$n.pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then ok "$n pid $pid alive (started by launch.sh)"; else bad "$n not running from $OSB_RUN_DIR"; fi
done
# Port must be owned by our next process tree (the pid file holds the npx parent).
owner="$(ss -ltnpH "sport = :$OSB_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
if [ -n "$owner" ]; then
  npid="$(cat "$OSB_RUN_DIR/next.pid" 2>/dev/null)"; p="$owner"; mine=0
  while [ -n "$p" ] && [ "$p" != 1 ] && [ "$p" != 0 ]; do [ "$p" = "$npid" ] && mine=1 && break; p="$(ps -o ppid= -p "$p" | tr -d ' ')"; done
  [ $mine = 1 ] && ok "port $OSB_PORT owned by our next (pid $owner)" || bad "port $OSB_PORT owned by pid $owner, not ours"
else bad "nothing listening on $OSB_PORT"; fi
html="$(curl -fsS -m 60 "$OSB_BASE_URL/" 2>/dev/null)"; [[ "$html" == *osbornalpha* ]] && ok "GET / renders brand" || bad "GET / did not render osbornalpha"
s="$(curl -fsS -m 30 "$OSB_BASE_URL/api/search?q=00700" 2>/dev/null)"
case "$mode" in
  guest) [[ "$s" == *'"developer-fallback"'* ]] && ok "search = developer-fallback (Supabase off, as intended)" || bad "search source unexpected: ${s:0:120}";;
  gate)  redirect="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 30 "$OSB_BASE_URL/macro")"
         case "$redirect" in
           "307 $OSB_BASE_URL/login?next=%2Fmacro"|"307 http://localhost:$OSB_PORT/login?next=%2Fmacro")
             ok "gate on: /macro → /login?next=/macro";;
           *) bad "gate mode but /macro did not redirect to login with next=/macro";;
         esac;;
esac
curl -fsS -m 3 "$OSB_CDP_URL/json/version" >/dev/null 2>&1 && ok "CDP answers on $OSB_CDP_PORT" || bad "CDP not answering"
q="$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$OSB_BASE_URL/api/quote/600519.SH")"
[ "$q" = 200 ] && ok "upstream market data reachable (/api/quote/600519.SH 200)" || echo "  warn /api/quote/600519.SH → $q (no outbound market data; quote/kline journeys will fail)"
echo "  info evidence dir $(cat "$OSB_RUN_DIR/evidence_dir" 2>/dev/null || echo none)"
[ $fail = 0 ] && echo "doctor: HEALTHY" || echo "doctor: UNHEALTHY — run scripts/cleanup.sh then scripts/launch.sh"
exit $fail
