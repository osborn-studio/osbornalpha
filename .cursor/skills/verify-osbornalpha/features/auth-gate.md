# Auth gate (signed-out access control)

`src/middleware.ts` + `src/app/(app)/layout.tsx`. Only `/`, `/about`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/design`, `/auth/*` and `/api/*` are public. Every other path redirects signed-out users to `/login?next=<destination>`, where the destination is sanitized by `src/lib/auth/return-destination.ts` (#208). API routes enforce auth themselves (e.g. `/api/portfolio` → 401).

## Sub-features
- Protected page → `/login?next=<path>`. `/en/<protected>` drops the `/en` prefix from `next`. `/today` and `/dashboard` permanently redirect to `/macro`. With the gate enabled, the chain ends at `/login?next=/macro`.
- Return-destination sanitizing (#208): `next` keeps only a literal local path. Query strings are dropped (`/portfolio?s=…&token=…` → `next=/portfolio`) except allowlisted `/intel/industries` selectors (`scheme`, `metric`, `level`, `duration`, `view`, `periods`; one valid value each, re-emitted in that order). The `/en/<protected>` hop applies the same sanitizing. Auth/API paths and anything non-literal fall back to `/macro`; email login and `/auth/callback` honour the sanitized `next` (only `/reset-password` / `/en/reset-password` bypass it for recovery).
- `/login` shows email + password inputs (Supabase password auth; OAuth buttons only for providers listed in `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS`).
- API: `/api/portfolio` signed out → 401 `{"error":"not authenticated"}`. `/api/watchlist` without Supabase → 200 `{"error":"Supabase not configured (guest mode uses localStorage)"}`.
- When Supabase env is **absent**, the gate is deliberately off (local dev), so the Macro Workbench shell renders at `/macro`.
- Not provable locally: an actual sign-in (so the post-login jump to the sanitized `next`), the `/login` → `/macro` bounce for a signed-in user, admin-only `/research` (403 for non-admins).

## How to get to it (user POV)
A signed-out visitor clicks any product link (今日 / 组合 / 股票池) or opens a deep link.

## Driving it with HTTP + CDP browser
- Guest mode: `node $S/drive.mjs auth-gate` checks the `/api/portfolio` 401 JSON, the `/login` inputs, both 308 aliases, and that opening `/today` shows the Macro Workbench heading at `/macro`. This checks access to the shell. Macro data requires a configured database.
- Gate mode: `OSB_MODE=gate $S/launch.sh` then `node $S/drive.mjs auth-gate`. It checks both 308 aliases, then asserts exact login destinations for `/macro`, the two aliases, `/portfolio`, `/en/portfolio`, and `/watchlist`, plus three sanitizing cases: `/portfolio?s=00700.HK&token=x` → `next=/portfolio`, `/intel/industries?metric=roe&scheme=sw2021&token=x` → `next=/intel/industries?scheme=sw2021&metric=roe`, and `/en/intel/industries?view=table&level=9` → `next=/intel/industries?view=table`. It also checks that `/` stays public. Screenshots `auth-login-<mode>.png`, `auth-gate-redirect.png`.

## Gotchas
- Gate mode is a stand-in: Supabase points at `http://127.0.0.1:54399` (closed) with a dummy anon key, so `getUser()` fails and every request is treated as signed out. It proves the redirect/allow-list logic, not real session handling. Those values are placeholders, not secrets.
- In gate mode the watchlist and stock journeys are not meaningful (pages redirect), and `/api/search` returns 503. `drive.mjs all` only runs landing, quote-api and auth-gate there.
- Each middleware request in gate mode attempts a connection to the dead port. That is fast locally (connection refused), but a firewall that drops instead of refusing would make every page slow.
