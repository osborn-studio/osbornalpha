# PR #147 provider date regression

Depends on PR #147's preparation modules. This test-only change adds no valuation method or activation path.

With Node 22 and installed project dependencies, run:

```sh
node --import tsx --test --test-concurrency=1 tests/industry-release-audit/provider-date-ingress.test.ts
```

At audited PR #147 head `02fcb9d6ab1f13691d085e47749e8e9fab7e4538`, two scalar controls pass and two rejection cases fail: a fractional numeric date rounds into the expected day, and a one-element array is coerced into a date. Both malformed inputs produced five official observation rows on that old head. PR #153 stacks on the corrected PR #147 branch (`codex/industry-valuation-next`); all four unchanged assertions must pass with the corrected provider. Keep #153 draft until #147 lands on main and the base is valid.

The default Vitest configuration includes only `src/**/*.test.ts`. The dedicated `Industry release audit` workflow runs the explicit command above on PRs targeting main or the dependency branch, on pushes to `codex/industry-release-audit`, and on manual dispatch. The shared `Application checks` workflow must also be dispatched on the PR #153 branch while stacked, because its pull-request filter targets main.

The tests start with provider JSON bytes and exercise the real scanner, adapter, and planner. They use no network, credentials, database, production flags, or publication code.
