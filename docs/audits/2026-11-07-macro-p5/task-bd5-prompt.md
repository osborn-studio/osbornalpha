You are Codex gpt-6.1-sol in this repository worktree (OsbornAlpha). Do NOT commit or stash. Print files changed and results.

TASK B-Δ5: remove the hardcoded method version from the clock gate.
`src/components/macro/judgment-view.ts::clockFrom` filters `c.methodology.id==='macro_regime'&&c.methodology.version==='v2'`. A v3 method is about to be registered; with the literal the clock goes blank. Owner rule: the clock reads the method version from the F4 card, never hardcodes it.
Change (failing tests first in judgment-view.test.ts):
- Candidates = cards with methodology.id === 'macro_regime' and a version matching /^v[1-9]\d*$/ (anything else is ignored).
- Take the highest numeric version present; `matching` = the cards of that version only. Exactly one → proceed with all the existing checks unchanged; more than one of that version → 'ambiguous'; none → 'missing'.
- So: a single v3 card selects; a v2 card next to a v3 card → the v3 card is used (v2 ignored); two v3 cards → ambiguous; a card with version 'draft' alone → missing.
- Anything in src/components/macro or src/app/(app)/macro that DISPLAYS the method version must read it from the selected card (`card.methodology.version` / its href), not from a literal; grep for 'v2' and '@v2' in non-test files there and fix real display/gating literals (comments may be reworded to "macro_regime method"). Do not touch src/lib/**.
- Never write the literal string MACRO_JUDGMENTS_ENABLED under src/components/macro.
Must pass: `npm test -- src/components/macro "src/app/(app)/macro"`, `npm run typecheck`, `npm run lint`.
