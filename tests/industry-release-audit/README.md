# PR #147 provider date regression

Depends on PR #147's preparation modules. This test-only change adds no valuation method or activation path.

With Node 22 and installed project dependencies, run:

```sh
node --import tsx --test --test-concurrency=1 tests/industry-release-audit/provider-date-ingress.test.ts
```

At audited PR #147 head `02fcb9d6ab1f13691d085e47749e8e9fab7e4538`, two scalar controls pass and two rejection cases fail: a fractional numeric date rounds into the expected day, and a one-element array is coerced into a date. Both malformed inputs currently produce five official observation rows. These are desired-behavior regression assertions, intentionally red until the owner fixes provider ingress. Merge after #147 and its correction. The default Vitest configuration includes only `src/**/*.test.ts`, so this dedicated audit suite requires the explicit command above.

The tests start with provider JSON bytes and exercise the real scanner, adapter, and planner. They use no network, credentials, database, production flags, or publication code.
