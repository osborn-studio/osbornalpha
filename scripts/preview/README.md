# Macro widget review harnesses

Run from the repository root with Node 22 and the lockfile dependencies installed.

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
PORT=3120 npx tsx scripts/preview/macro-clock.ts
# In a second terminal:
npx tsx scripts/preview/workbench-server.ts
```

Both servers default to the full immutable captures in `/tmp/osstack/widget-full-fixtures/`:
`osbornalpha-{us,cn}-{card,snapshot}.json`. Set `MACRO_PREVIEW_FIXTURE_ROOT` to another directory containing those filenames if needed. No credentials or production requests are used.

- `http://127.0.0.1:3120/?region=US&locale=en`: component preview shell. Its sidebar is preview-only.
- `http://127.0.0.1:3121/macro?region=US&locale=en`: the **actual `MacroWorkbench` component**, with its real overview hook, judgment slot, source drawer, and subcomponents. The main width/padding matches `(app)/layout.tsx`; global account chrome and the authenticated Next server layout are not mounted.
- `http://127.0.0.1:3121/component?region=CN&locale=zh`: the component shell using the same full captures and compiled Tailwind CSS.

The workbench server replaces only the Supabase auth-event boundary and network transport. Its overview adapter derives indicator values from the full snapshot observations and catalog; empty change counts and collection arrays are transport defaults, not claims about production collection or change history. Its evidence endpoint serves only captured observation fields, with missing retrieval/evidence/derived inputs shown honestly. The actual methodology link navigates to the exact target URL, where the harness serves the real methodology Markdown as text; the full Next methodology page is outside this harness. Other full application detail/strategy routes are not served here.

```sh
npx playwright test -c scripts/preview/workbench-layout.config.ts
MACRO_CLOCK_PREVIEW_PORT=3122 npx playwright test -c scripts/preview/macro-clock.config.ts
```

The first suite covers both regions and languages at 320/390/768/1024/1440, every phase's values/rules/weights/contributions, individual cell and text-range edges, current versus inspection, navigation, evidence callback/drawer, and narrow/wide desktop containers. It also pins the reported 544px quadrant case at viewport 1440. Bundles, geometry records, and screenshots go under `/tmp/osstack/macro-widget-correction/`; server build outputs are isolated by process. The component server isolates its output by port, so tests do not overwrite another running review preview.
