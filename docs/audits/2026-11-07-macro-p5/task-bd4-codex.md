Changed only these task files:

- `src/components/macro/ClockPhasePanel.tsx`: added expanded-state attribute.
- `src/components/macro/AllocationTemplateCard.tsx`: replaced Tailwind utilities with semantic classes and imported CSS directly.
- `src/components/macro/investment-clock.css`: full-width expanded panels at ≥900px, restored mobile row cards, retained scroll fallback, and added responsive allocation styling.

Current-panel selection and copy keys remain unchanged.

Results: **208 tests passed**, typecheck passed, lint passed, and diff whitespace check passed. Browser verification was blocked by sandbox permissions.

No commits or stashes. Pre-existing changes were left untouched.