# osbornalpha feature map

The maintained list of user-facing features that `verify-osbornalpha` knows how to drive. Every file follows the same four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.
A proof that drives one entry point is incomplete when the file lists others.

| feature | file | journey (`scripts/drive.mjs`) | modes | needs internet |
|---|---|---|---|---|
| Landing page + zh/en i18n + design showcase | [landing-i18n.md](landing-i18n.md) | `landing` | guest, gate | no |
| Guest watchlist: search, add, persist, de-dup | [watchlist.md](watchlist.md) | `watchlist` | guest | yes (quotes) |
| Stock detail page + K-line chart | [stock-detail.md](stock-detail.md) | `stock` | guest | yes |
| Public market-data & search API | [market-data-api.md](market-data-api.md) | `quote-api` | guest, gate | yes |
| Auth gate (signed-out access control) | [auth-gate.md](auth-gate.md) | `auth-gate` | guest, gate | no |

Not yet mapped (need real Supabase / credentials): sign-in and register, `/today`, `/portfolio`, `/research/*`, `/briefs`, `/settings`, `/copilot`, `/admin`, Stripe billing, the Hermes / John Cameron CLI skills.
