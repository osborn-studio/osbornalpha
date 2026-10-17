# Quote probe availability and preferred-source quality (D3.3 partial)

The gateway workflow now calls `scripts/quotes/probe_quality.py`. It emits only
fixed classification fields, never raw quote prices, provider names or payloads.
Exit0 requires both availability=available and preferred_source=selected.
Usable fallback quotes remain availability=available with preferred_source=degraded
and exit1: a fallback never satisfies the required Wind probe.

Both expected ticker quotes need finite positive numeric prices, and failed/stale
counters must be real integers in0..2. Missing/invalid payloads fail closed. Source
identity must agree between each quote and selected_sources to count as Wind;
missing source identity is unknown. Any explicit delayed=true or stale counter
marks availability stale. The classifier does not independently verify timestamps
against market calendars or provider freshness; declared metadata is not proof of
current market availability. This scope does not fabricate live availability.

Input is limited to2MiB and workflow curl download uses --max-filesize2097152.
Counters/shape limits do not amount to an authenticity boundary. Malformed/oversize
input emits invalid fixed fields. Unknown/degraded/stale/unavailable/invalid all
exit1; consumers distinguish the JSON fields rather than the common exit code.
The original cron, retry count, concurrency and cron-alert job remain unchanged.
A checkout step provides the local classifier. No workflow was triggered or
rerun, no quote endpoint called, and no schedule increased in this batch.

Strict isolated Opus5.5 task_ac80b292 reviewed initial source/synthetic fixtures
and unchanged workflow context. Accepted3 findings: valid exact-limit/oversize
JSON controls rather than invalid padding; exact stdout bytes/key contract and
provider-name privacy assertions; per-quote/meta source agreement and explicit
delayed flags. Final workflow integration is host verified, not second-reviewed.

Final task_f558702d passes9 Python regression tests and py_compile/diff check.
One test executes the actual gateway shell extracted from YAML with a temporary
stub curl and synthetic payloads; no network call occurs. It confirms preferred
pass/fallback failure, fixed output privacy, download bound and unchanged cron.
This is local shell acceptance, not a GitHub-hosted runner or production result.

Alert deduplication/recovery events, independent timestamp/market-calendar
freshness and continuous24h ordinary-schedule acceptance remain open. D3.3 is
partial; D3.4 is not complete. Provider Retry-After and cached-work policy are
separate D3.2 follow-ups. No production activation or merge approval inferred.
