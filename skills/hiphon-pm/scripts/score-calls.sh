#!/usr/bin/env bash
# score-calls.sh — deterministic track-record scorer for Hiphon PM.
#
# Reads the append-only call journal (~/.hiphon-pm/calls.jsonl), scores each call
# against ADJUSTED daily klines (GET /api/kline, eastmoney fqt=1 前复权 — corporate-action
# correct), and writes ~/.hiphon-pm/scorecard.json. NO LLM. The script is the ONLY thing
# that adjudicates hit/miss — the agent never decides its own outcomes.
#
# Lifecycle (storage.md §2): OPEN until exactly one of manual_close > hit_stop > hit_target
# > expired fires. OPEN calls are unrealized MTM only and excluded from the closed hit rate.
# Calibration buckets are gated at n>=MIN_SAMPLE (storage.md §4) to avoid small-n overfitting.
#
# Requires: bash, curl, jq. Env: STOCK_MONITOR_SITE_PASSWORD (prod), STOCK_MONITOR_BASE_URL (opt).
set -euo pipefail

HOME_DIR="${HIPHON_HOME:-$HOME/.hiphon-pm}"
CALLS="$HOME_DIR/calls.jsonl"
OUT="$HOME_DIR/scorecard.json"
BASE="${STOCK_MONITOR_BASE_URL:-https://stock-monitor-nu.vercel.app}"
MIN_SAMPLE="${HIPHON_MIN_SAMPLE:-20}"
JAR="$(mktemp -t smjar.XXXXXX)"
TODAY="${HIPHON_TODAY:-$(date -u +%Y-%m-%d)}"   # override for deterministic tests
trap 'rm -f "$JAR"' EXIT

command -v jq >/dev/null || { echo "ERROR: jq required" >&2; exit 1; }
mkdir -p "$HOME_DIR"
[ -f "$CALLS" ] || { echo "no calls journal at $CALLS — nothing to score"; echo '{"generated_utc":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","closed":{"n":0},"open":{"n":0},"calibration":{"min_sample":'"$MIN_SAMPLE"',"buckets":[]}}' > "$OUT"; exit 0; }

sm_unlock() {
  [ -z "${STOCK_MONITOR_SITE_PASSWORD:-}" ] && return 0
  curl -s -c "$JAR" -X POST "$BASE/api/auth/unlock" -H 'content-type: application/json' \
    -d "{\"password\":\"$STOCK_MONITOR_SITE_PASSWORD\"}" >/dev/null || true
}
sm_get() { curl -s -b "$JAR" -m 30 "$BASE$1"; }
sm_unlock

# manual_close events: call_id -> close date (YYYY-MM-DD from ts_utc)
MANUAL="$(jq -c 'select(.kind=="event" and .event=="manual_close") | {id:.call_id, d:(.ts_utc[0:10])}' "$CALLS" 2>/dev/null | jq -s 'map({(.id):.d}) | add // {}')"

VERDICTS="[]"
while IFS= read -r call; do
  [ -z "$call" ] && continue
  ticker="$(jq -r '.ticker' <<<"$call")"
  kline="$(sm_get "/api/kline/$(jq -rn --arg t "$ticker" '$t|@uri')?period=D&limit=500")"
  bars="$(jq -c '.bars // []' <<<"$kline" 2>/dev/null || echo '[]')"
  # Per-call verdict computed entirely in jq (deterministic).
  verdict="$(jq -n \
    --argjson call "$call" --argjson bars "$bars" --argjson manual "$MANUAL" \
    --arg today "$TODAY" '
    def sess_date: ($call.exchange_session // "X:1970-01-01") | split(":")[1];
    ($call.entry_basis // "next_open") as $basis |
    sess_date as $sd |
    # entry bar: next_open -> first bar with time > sd (use open); same_close -> first bar time>=sd (use close)
    ([ $bars[] | select(.time > $sd) ] | first) as $nb |
    ([ $bars[] | select(.time >= $sd) ] | first) as $cb |
    (if $basis=="same_close" then ($cb.close // null) else ($nb.open // null) end) as $entry |
    (if $basis=="same_close" then ($cb.time // null) else ($nb.time // null) end) as $entry_date |
    if $entry==null or $entry<=0 then
      {call_id:$call.call_id, state:"no_data", scored:false}
    else
      [ $bars[] | select(.time >= $entry_date) ] as $fwd |
      ($call.stop_price // null) as $stop |
      ($call.target_pct // null) as $tgt |
      ($entry * (1 + (($tgt // 0)/100))) as $tgt_price |
      ($manual[$call.call_id] // null) as $mclose |
      ($fwd | last) as $latest |
      # find first stop breach and first target hit
      ([ $fwd[] | select($stop!=null and .low <= $stop) ] | first) as $stopbar |
      ([ $fwd[] | select($tgt!=null and .close >= $tgt_price) ] | first) as $tgtbar |
      # days since entry
      (( ($today|strptime("%Y-%m-%d")|mktime) - ($entry_date|strptime("%Y-%m-%d")|mktime) ) / 86400 | floor) as $age |
      ($call.rating) as $r |
      (
        if $mclose!=null then
          ([ $fwd[] | select(.time <= $mclose) ] | last) as $mb |
          {state:"closed", reason:"manual", exit:($mb.close // $latest.close)}
        elif ($r=="sell" or $r=="trim") then
          # reduce side: no long stop/target walk — evaluate price direction over horizon
          (if $age > ($call.horizon_days // 120)
             then {state:"closed", reason:"expired", exit:$latest.close}
             else {state:"open", reason:"open", exit:$latest.close} end)
        elif $stopbar!=null and ($tgtbar==null or $stopbar.time <= $tgtbar.time) then
          {state:"closed", reason:"hit_stop", exit:$stop}
        elif $tgtbar!=null then
          {state:"closed", reason:"hit_target", exit:$tgtbar.close}
        elif $age > ($call.horizon_days // 250) then
          {state:"closed", reason:"expired", exit:$latest.close}
        else
          {state:"open", reason:"open", exit:$latest.close}
        end
      ) as $term |
      (($term.exit - $entry)/$entry*100) as $ret |
      ( if $r=="sell" or $r=="trim" then ($ret < 0)      # price fell after the sell = good exit = hit
        elif $r=="hold" then null
        else ($term.reason=="hit_target") or ($ret > 0)   # long: win
        end ) as $hit |
      {call_id:$call.call_id, market:$call.market, rating:$r,
       signal_mix:($call.signal_mix // []), chain_role:($call.chain_role // null),
       evidence:($call.evidence // null),
       state:$term.state, reason:$term.reason,
       entry:$entry, entry_date:$entry_date, exit:$term.exit, return_pct:($ret*100|round/100),
       scored:($term.state=="closed" and $hit!=null), hit:$hit}
    end' 2>/dev/null || echo '{"state":"no_data","scored":false}')"
  VERDICTS="$(jq -c --argjson v "$verdict" '. + [$v]' <<<"$VERDICTS")"
done < <(jq -c 'select(.kind=="call")' "$CALLS")

[ -n "${HIPHON_DEBUG:-}" ] && { echo "--- verdicts ---" >&2; jq -c '.[]' <<<"$VERDICTS" >&2; }

# Aggregate into scorecard.json
jq -n --argjson v "$VERDICTS" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson floor "$MIN_SAMPLE" '
  ([ $v[] | select(.scored==true) ]) as $closed |
  ([ $v[] | select(.state=="open") ]) as $open |
  ([ $closed[] | select(.rating=="strong_buy" or .rating=="buy" or .rating=="add") ]) as $long |
  ($closed | length) as $cn |
  ($closed | map(select(.hit==true)) | length) as $hits |
  {
    generated_utc: $now,
    closed: {
      n: $cn,
      hits: $hits,
      hit_rate: (if $cn>0 then ($hits/$cn*100|round) else null end),
      avg_return_pct_long: (if ($long|length)>0 then ([$long[].return_pct]|add/($long|length)*100|round/100) else null end),
      by_rating: ( $closed | group_by(.rating) | map({key:.[0].rating, value:{n:length, hit_rate:((map(select(.hit==true))|length)/length*100|round)}}) | from_entries )
    },
    open: {
      n: ($open|length),
      unrealized_avg_pct: (if ($open|length)>0 then ([$open[].return_pct]|add/($open|length)*100|round/100) else null end)
    },
    calibration: {
      min_sample: $floor,
      buckets: ( $closed
        | group_by(.market + "|" + ((.signal_mix//[])|sort|join("+")))
        | map({ key: (.[0].market + "|" + ((.[0].signal_mix//[])|sort|join("+"))),
                n: length,
                hit_rate: ((map(select(.hit==true))|length)/length*100|round),
                reliable: (length >= $floor) }) ),
      by_evidence: ( [ $closed[] | select(.evidence!=null) ]
        | group_by(.evidence)
        | map({ key: .[0].evidence, n: length,
                hit_rate: ((map(select(.hit==true))|length)/length*100|round),
                reliable: (length >= $floor) }) ),
      by_chain_role: ( [ $closed[] | select(.chain_role!=null) ]
        | group_by(.chain_role)
        | map({ key: .[0].chain_role, n: length,
                hit_rate: ((map(select(.hit==true))|length)/length*100|round),
                reliable: (length >= $floor) }) )
    }
  }' > "$OUT"

echo "scored $(jq '.closed.n' "$OUT") closed / $(jq '.open.n' "$OUT") open → $OUT"
jq '{closed:.closed, open:.open, reliable_buckets:([.calibration.buckets[]|select(.reliable)]|length)}' "$OUT"
