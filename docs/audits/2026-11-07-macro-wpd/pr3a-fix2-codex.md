Changed only `messages/zh/macro.json` and `messages/en/macro.json`, adding `units.usd_mn` and `units.usd_bn` with the requested translations and existing formatting.

Validation passed:

- Macro message parity: **4 tests passed**.
- Typecheck and lint: **passed**.
- Requested suite: **1,906 passed, 170 skipped** across 145 files.
- Existing formula hash test: **1 passed**.
- Protected-path diff against `origin/main`: **empty**.

Recomputed `macro_regime@v2` formula hash:
```text
dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba
```

No merge fixes were needed. No commit was created; the existing untracked prompt file was left untouched.