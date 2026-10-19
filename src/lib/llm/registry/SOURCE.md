# LLM registry snapshot

`providers.json` and `models.json` are verbatim copies of `packages/llm-registry/data/*.json`
from the Osborn-PA repository (`@osborn-pa/llm-registry` 0.1.0, not yet published).

| | |
|---|---|
| Repository | osborn-studio/Osborn-PA |
| Branch | `main` (PR #140 endpoint-level auth + doubao overrides; PR #141 doubao release dates) |
| Branch head at copy time | `860e48cf` |
| Last commit touching the package | `d82eaf8fe4f5e408182e394b87996cb002c32fd7` |
| Copied on | 2026-10-19, second refresh (first snapshot 2026-10-18 from `codex/llm-provider-learnings` @ `af7dfe66`, then `main` `6b52e76a`) |
| Read-only endpoint (not consumed yet) | `https://www.osbornpa.com/api/llm-registry/v1/{providers,models}.json` |
| Schema | `osborn-llm-registry/providers@1`, `osborn-llm-registry/models@1` |

`derive.ts` is a TypeScript port of the package's `src/derive.js` restricted to what Alpha
uses (`deriveProviders('alpha')`, `endpointFor`, `authFor`, `resolveUrl`, `referencePrice`, `NON_CHAT`).
`fixtures/alpha-derived.json` is the exact output of the upstream `derive.js` for app `alpha`
at the commit above; `derive.test.ts` asserts the port reproduces it. When the package is
published, replace this directory with a dependency and delete the port.

Refresh procedure: copy the two JSON files, regenerate the fixture with
`node --input-type=module -e 'import { deriveProviders, unsupportedProviders } from "./packages/llm-registry/src/derive.js"; console.log(JSON.stringify({ providers: deriveProviders("alpha"), unsupported: unsupportedProviders("alpha") }, null, 2))'`
in the PA checkout, update the commit hashes above, and run the tests.

Design: `docs/superpowers/specs/2026-10-18-llm-registry-adoption-design.md`.
