# Output Contracts

Use these structures for integrated research outputs.

## Chain Map

```text
Theme:
Geography:
Horizon:
End system:
Demand driver:

Layers:
1. End demand / deployment:
2. System integrator / OEM:
3. Subsystems:
4. Core components:
5. Manufacturing / assembly / test:
6. Equipment / tooling:
7. Specialty materials:
8. Raw inputs:
```

## Bottleneck Record

```text
Bottleneck:
Chain layer:
Constraint type:
Why it is narrow:
Evidence status: confirmed | management-claim | inference | speculation
Consensus awareness: low | medium | high
What confirms it:
What breaks it:
```

## Candidate Record

```text
Company:
Ticker:
Market:
Role: proven-executor | true-bottleneck | second-order-beneficiary | early-optionality | crowded-leader | avoid-watch-only
Chain layer:
Why it belongs:
Evidence grade: primary | medium | weak | unknown
Key sources:
Validation questions:
Falsification trigger:
Next workflow: C | A | D | reject
```

## Evidence Ledger

```text
Claim:
Source:
Source class: primary | medium | weak | unknown
Date:
Quote or retrieval note:
Interpretation:
Confidence: high | medium | low
```

## Follow-Up Queue

```text
Strong research candidates:
Needs company diligence:
Needs valuation:
Needs signal watch:
Rejected but watch:
Missing evidence:
```

## Single-Stock Research Book

Use for Workflow A.

```text
Workflow:
Company:
Ticker:
As-of date:

1. Entity resolution:
2. Source inventory:
3. Business and segment map:
4. Financial quality:
5. Moat and competition:
6. Management and governance:
7. Catalysts:
8. Risks and falsification triggers:
9. Valuation range and assumptions:
10. Open questions:
11. Next workflow: C | D | stop
```

## Research Dashboard

Use for Workflow C.

```text
Workflow:
As-of date:
Input universe:

Daily priority queue:
New evidence:
Thesis changes:
Candidate movements:
Signal ledger summary:
Deep-dive queue:
Weekly backlog:
Missing-source list:
```

## PM Decision Pack

Use for Workflow D.

```text
Workflow:
Company:
Ticker:
Decision: research-only | watch | starter | add | trim | exit | reject
Evidence quality:
Valuation range:
Signal state:
Position sizing:
Entry zone:
Falsification / stop:
Downside case:
IC memo:
Tracking record:
```
