# Workflow C: Daily Watchlist Research Dashboard

## scope

Workflow C, daily dashboard for watchlist and B-stage candidate pool tracking. Inputs: prior B candidates, current watchlist, signal records, price moves, news, filings, and prior research artifacts.

## daily priority queue

1. Promote: candidate with new evidence from an official filing or transcript and positive signal state.
2. Review: candidate with large price move but no new evidence.
3. Monitor: candidate with medium signal but missing-source on the thesis driver.
4. Downgrade: candidate where evidence weakens or thesis changes.

The queue is research-only. No automated trading.

## new evidence

New evidence table:

| Company | Source class | Source | Change | Confidence |
| --- | --- | --- | --- | --- |
| Example Optical Supplier | primary | official filing or transcript | capacity language changed | medium |
| Example Component Vendor | medium | dated industry press | demand indicator changed | low |
| Missing Item | unknown | missing-source: official capacity data | cannot upgrade thesis | low |

Every material item includes source class and new evidence status.

## thesis changes

- promoted: evidence improved and candidate movement supports deep research.
- downgraded: price action changed but source quality did not improve.
- unchanged: no source update or signal change.

## signal ledger

Signal ledger summary uses strong, medium, weak, re-entry monitor, secondary discovery, blind spot, and daily log categories. Signals are not valuation and not trade execution.

## deep-dive queue

Promote to Workflow A when:

- source class is primary or strong medium
- thesis driver has new evidence
- valuation or financial quality needs deeper work

Promote to Workflow D only when the user explicitly asks for a PM decision pack.

## weekly backlog

- company diligence backlog
- valuation backlog
- source collection backlog
- rejected but watch backlog
- missing-source backlog

## action log

promote candidates with upgraded evidence; downgrade candidates with weakened evidence; keep watchlist names in tracking until a falsification trigger fires.
