# Workflow A: Single-Stock Research Book

Use this workflow when the user names one company and asks for 单股深研, research book, due diligence, earnings research, or valuation support.

## Inputs

- company name
- ticker and exchange when available
- fiscal period when earnings-focused
- user-provided source files when available
- prior B/C artifacts when promoted from a theme workflow

## Use Local Skills

- Use `earnings-research-book` for source-first earnings books.
- Use `osbornhub-company-diligence` for seven-section company diligence.
- Use `osbornhub-generic-dcf` when valuation is requested.

## Outputs

- entity resolution
- source inventory
- business and segment map
- financial quality
- moat and competition
- management and governance
- catalysts
- risks and falsification triggers
- valuation range if requested
- open questions

## Stages

### 1. Entity Resolution

Resolve the company, ticker, market, reporting currency, fiscal year, and peer set before writing analysis. If resolution is ambiguous, ask a narrow clarification or list the ambiguity.

### 2. Source Inventory

Create the source inventory before citing evidence. Minimum source classes:

- official filing or annual report
- latest quarterly filing or exchange announcement
- transcript, IR Q&A, investor presentation, or management commentary
- Stock Monitor quote/signals/radar data when available
- user-provided lawful private material when supplied

Missing source types must be marked with `missing-source:`.

### 3. Business And Segment Map

Separate revenue engines, customer groups, geographies, product cycles, and segment economics. Mark each material segment claim as confirmed evidence, management claim, inference, or speculation.

### 4. Financial Quality

Cover growth, gross margin, operating margin, cash conversion, capex, working capital, leverage, and dilution/SBC where relevant. Do not fabricate unavailable figures.

### 5. Moat, Competition, And Chain Position

Explain moat through customer qualification, switching cost, scale, IP, supply-chain position, or distribution. Link the company back to the B chain role when the stock came from a theme workflow.

### 6. Catalyst And Risk

List the next 3-5 catalysts, what confirms each, and what falsifies the thesis. Risks should include both business risk and evidence risk.

### 7. Valuation Input

If valuation is requested, prepare explicit assumptions for `osbornhub-generic-dcf`: revenue, margin, capex, working capital, WACC, terminal growth, and sensitivity cases. Output a valuation range, not a single false-precision number.

### 8. Handoff

Send names back to C for monitoring when research is incomplete. Promote to D only when the user asks for a PM decision pack or position action.

## Minimum Output

Return:

1. entity resolution
2. source inventory
3. business and segment map
4. financial quality
5. moat and competition
6. catalysts
7. risks and falsification triggers
8. valuation range or valuation assumptions
9. open questions
10. C/D handoff

## Source Rule

Do not cite sources that are not captured in the source inventory or explicitly retrieved during the current workflow.

End A outputs with: 本分析仅作研究参考，不构成投资建议.
