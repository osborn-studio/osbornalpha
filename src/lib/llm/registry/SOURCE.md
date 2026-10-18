# LLM registry snapshot

`providers.json` and `models.json` are verbatim copies of `packages/llm-registry/data/*.json`
from the Osborn-PA repository (`@osborn-pa/llm-registry` 0.1.0, not yet published).

| | |
|---|---|
| Repository | osborn-studio/Osborn-PA |
| Branch | `codex/llm-provider-learnings` |
| Branch head at copy time | `af7dfe66d3fad1341331925f3029fa79ef5b3965` |
| Last commit touching the package | `ad876bf3e40b94128d79a0690cd740d494aab28a` |
| Copied on | 2026-10-18 |
| Schema | `osborn-llm-registry/providers@1`, `osborn-llm-registry/models@1` |

`derive.ts` is a TypeScript port of the package's `src/derive.js` restricted to what Alpha
uses (`deriveProviders('alpha')`, `endpointFor`, `resolveUrl`, `referencePrice`, `NON_CHAT`).
`fixtures/alpha-derived.json` is the exact output of the upstream `derive.js` for app `alpha`
at the commit above; `derive.test.ts` asserts the port reproduces it. When the package is
published, replace this directory with a dependency and delete the port.

Refresh procedure: copy the two JSON files, regenerate the fixture with
`node --input-type=module -e 'import { deriveProviders, unsupportedProviders } from "./packages/llm-registry/src/derive.js"; console.log(JSON.stringify({ providers: deriveProviders("alpha"), unsupported: unsupportedProviders("alpha") }, null, 2))'`
in the PA checkout, update the commit hashes above, and run the tests.

Design: `docs/superpowers/specs/2026-10-18-llm-registry-adoption-design.md`.
