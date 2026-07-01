# Workflow D: PM Decision Pack

Use this workflow when the user asks for a PM-style decision, position sizing, entry zone, stop, trim/add/exit decision, or investment committee memo.

## Inputs

- candidate from B/C/A
- portfolio and constraints when provided
- valuation range
- signal state
- evidence quality
- thesis confidence
- risk and falsification triggers

## Use Local Skills

- Use `osbornhub-ic-memo` for the memo skeleton.
- Use `osbornhub-generic-dcf` when fair value bands are required.
- Use Hiphon PM doctrine and tracking discipline when producing personal PM-style decisions.

## Outputs

- decision: research-only | watch | starter | add | trim | exit | reject
- position sizing range
- entry zone
- stop or falsification condition
- catalyst path
- downside case
- IC memo
- tracking record suggestion

## Guardrails

D may include direct PM-style action language only when explicitly requested. Every action must include evidence quality, position size, risk, and falsification logic. No automated trading.
