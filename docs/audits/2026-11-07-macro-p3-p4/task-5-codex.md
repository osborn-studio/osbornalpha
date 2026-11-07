| # | Sev P1/P2/P3 | File:line | Defect | Fix |
|---|---|---|---|---|
| 1 | P3 | `src/lib/macro/strategy/policy-events.ts:55` | A correctly dated transition with `s = u = l` returns no event and no gap. Confirmed with a standalone probe. Spec §5.4 requires a transition event when the three date conditions hold; this adds an undocumented value-change condition. | Emit the verified transition unconditionally, including `change_bp: '0'`; add an equal-value test. |
| 2 | P3 | `src/lib/macro/strategy/policy-events.test.ts:74` | The claimed replay check only compares endpoint values after `Number()` conversion. It never recomputes `change_bp`, and floating-point conversion can hide decimal differences. Transition-tuple retention without a transition event is also untested. | Recompute changes using exact decimal arithmetic from frozen evidence; assert canonical endpoints and `change_bp`. Add an unverified-transition case asserting retained tuple rows. |

pass with P3 notes