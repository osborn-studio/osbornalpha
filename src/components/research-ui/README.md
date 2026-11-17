# Research UI

Import from `@/components/research-ui`. Components use the `research` message domain through `NextIntlClientProvider`; callers supply localized content and display-ready values. Use semantic tokens and `font-mono tabular-nums` for numbers.

`ResearchChain` renders the research navigation and availability states. It is already mounted in the app layout; do not mount another in section pages. `CHAIN_STEPS`, `DEFAULT_CHAIN_AVAILABILITY`, `chainVisible`, `activeChainStep`, and `chainItems` expose its route model and typed availability contract.

```tsx
// App layout only; already mounted there.
const availability = {...DEFAULT_CHAIN_AVAILABILITY, foreign: false};
<ResearchChain availability={availability} />
```

`PageHeader` provides title, scope, optional controls, freshness and legend. `FreshnessChip` shows the supplied date and collection status. Their exported props describe the supported inputs.

```tsx
<PageHeader
  title={t('title')} scope={t('scope')}
  freshness={{asOf: '2026-11-17', status: 'fresh'}}
/>
```

`StateBadge` names a unified state; `StateCell` suppresses values for states that must not show them. `RESEARCH_STATES`, `STATE_SHOWS_VALUE`, `STATE_SHAPE`, `STATE_TONE`, `LEGACY_STATE_MAP` and `unifiedState` expose the shared vocabulary and mapping; `ResearchState` is the corresponding type. These UI helpers do not replace server-side withholding.

```tsx
const state = unifiedState('reconstruction')!;
<StateBadge state={state} />
<StateCell state={state} value="4.2" detail={t('basis')} />
```

`MarkCard` groups evidence, `MarkTag` labels it, and `MarkLegend` explains the marks. `MarkKind` is fact, judgment or hypothesis; `MarkCardProps` also supports an institution for attributed judgments.

```tsx
<MarkCard kind="judgment" title={t('assessment')}>
  <p>{t('assessmentText')}</p>
</MarkCard>
<MarkTag kind="fact" />
<MarkLegend />
```

`ChartTableSwitch` keeps a table available beside the chart view. `lineSegments` splits points at null `y` values; render each returned segment independently without interpolation across gaps.

```tsx
const segments = lineSegments(points);
const chart = <SeriesChart segments={segments} />;
<ChartTableSwitch chart={chart} table={<DataTable rows={points} />}
  narrowTable title={t('history')} />
```

`ResearchFooter` deduplicates publisher/relay chips and shows a methods link and disclaimer. `ResearchSource` and `ResearchFooterProps` describe its inputs.

```tsx
<ResearchFooter
  sources={[{publisher: t('publisher'), relay: t('relay')}]}
  methodsHref="/macro/methods"
/>
```

`SourceDrawer` owns the modal, focus restoration/trap, responsive layout, six sections and copy action. `SourceDrawerInput` distinguishes ok/revised from withheld/retracted; restricted variants have no payload or value. `SourceDrawerPayload` is evidence-ref/1; `SourceDrawerExtras` adds module display rows, states and revisions. `SourceDrawerAdapter<T>` is a pure mapping function; `DrawerText` resolves module-owned message keys. `EVIDENCE_KINDS`/`EvidenceKind`, `DRAWER_SECTIONS`/`DrawerSectionId`, `DrawerRow`, `ValueAt` and `SourceDrawerProps` complete the contract. The pure `drawerSections`, `drawerHeader`, and `drawerRevised` helpers expose the model (`SectionRow`, `SectionModel`, `Labels`).

```tsx
const input = target ? adaptSource(target) : null;
<SourceDrawer input={input} onClose={() => setTarget(null)}
  text={resolveModuleText} pending={pendingSections}
  slots={{transform: derivedInputProof}} />
```

Null standard fields retain their rows and render Missing. Optional extras are omitted when undefined. `pending` replaces section content with static bars; `failed` replaces it with a localized note. Slots render after rows and tables in successfully loaded sections. Keep fetching in the module.

## State mapping

Current words below come from `LEGACY_STATE_MAP`.

| Module's current word | Unified state | Cell shows | Drawer shows |
| --- | --- | --- | --- |
| `missing`, `M`, `—` | `missing` | 缺失 + reason phrase | reason code and text |
| `restricted`, `R`, `unlicensed`, `withheld`, `授权待确认` | `withheld` | 受限 + reason; value never leaves the server | identity and reason only |
| `not_served` | `notServed` | 未服务 | explanation, no expectation set |
| `coverageSic`, `insufficient`, `members`, `low_coverage` | `lowCoverage` | 覆盖不足 + ratio, no aggregate value | numerator, denominator, unresolved count |
| `reconstruction` | `reconstructed` | value + small badge | reconstruction basis and availability time |
| `stale` | `stale` | value as usual, header chip turns amber | expected cadence and last success |
| `revised`, `修订`, `drift:revised` | `revised` | value + 已修订 | old and new values side by side |
| `quarantined`, `rejected`, `unpublished`, `retracted` | `retracted` | 已撤回, no value | retraction category and time |

Origins: `missing`, `M`, `—` refer to macro status code `M`, industry cell `display: 'missing'` and table em dash placeholders; `restricted` / `R` to macro status code `R`, `unlicensed` to industry dataset licence state, `withheld` to evidence resolver state (topic spec 4.1) and the company evidence gate, and `授权待确认` to licence-pending wording in existing copy; `not_served` is an evidence resolver state for markets the product does not serve; `coverageSic`, `insufficient`, `members` come from industry `PublicCell.display`, while `low_coverage` is generic; `reconstruction` comes from industry run `history_class`; `stale` from dq freshness status; `revised` / `修订` are revision wording and `drift:revised` is a topic drift state; `quarantined` / `rejected` are macro observation / fact row statuses, `unpublished` refers to publication snapshots, and `retracted` is an evidence resolver state.

## Drawer migration notes

Macro: `src/components/macro/SourceDrawer.tsx` is migrated in this change through `source-drawer-adapter.ts`. The adapter maps the displayed observation, source, retrieval, locator, availability, code version, rights and revision history. Mapping/method versions remain null. Derived-input proof stays in `slots.transform`; the wrapper retains version fetching and exact observation selection.

Industries: `src/components/industries/SourceDrawer.tsx` has `DrawerPayload` kinds aggregate / valuation / fact / membership, plus replay and recompute. Map aggregate and valuation to `industry_metric`; carry run id, scheme, cell, coverage and history class in `extras.rows.source` and `extras.states`. Map fact to `financial_fact`. Replay/recompute controls and roles/inputs tables belong in `slots.transform`. Membership has no evidence kind in evidence-ref/1: keep its panel or raise it with the design session. `SourceDrawerProvider`, `SourceButton` and `SourceDot` can stay as the opener API.

Company disclosures: map `src/components/company/DisclosureDrawer.tsx` to `financial_fact`, including issuer, concept, filing accession, XBRL locator and mapping version; CN values use the `withheld` variant. The shared drawer does not provide the stack in `drawer-stack.ts`; keep `DrawerHost.tsx` and render the shared drawer as the top panel. `FormulaDrawer.tsx` is not a source drawer and stays.

Company citations: map `src/components/company/f3-source-drawer.tsx` to `document_citation`, including document title, page, snippet, text hash and visibility. Page text with the highlighted citation goes in `slots.source`, and signed download links in `extras.links`. Hash verification failures map to `failed`.

Foreign research (PR #252): map to `broker_report_meta`; the PDF row is a `DrawerRow` with `state: 'withheld'`. Rating and target price are institution views and do not belong in the source drawer.

## Not provided

Drawer stacking, a provider/opener API, and per-module data fetching.
