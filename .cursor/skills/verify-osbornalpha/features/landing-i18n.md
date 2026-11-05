# Landing page + i18n

Public marketing landing at `/` (src/app/page.tsx), English variant at `/en` (middleware rewrite + `x-app-locale`, no `[locale]` segment), and the static design showcase at `/design`.

## Sub-features
- `/` picks its language from `Accept-Language`: a zh browser gets `<html lang="zh-CN">` and the title `osbornalpha · AI 投资监控工作台`.
- `/en` is always English (`lang="en"`, title `osbornalpha · AI Investment Cockpit`) whatever the browser locale is.
- `/design` renders "V3 Design System" (public, static demo content).

## How to get to it (user POV)
Open the site root. An English reader opens `/en`. The design page is reachable directly at `/design`.

## Driving it with CDP browser
`node $S/drive.mjs landing`. It uses a `zh-CN` context: `goto('/')`, then asserts status 200, the title regex `/AI 投资监控工作台/`, `html[lang]=zh-CN`, and that the text `osbornalpha` is visible. Then it does `goto('/en')` (title `/AI Investment Cockpit/`, `lang=en`), then `goto('/design')` (text `V3 Design System`). Screenshots: `landing-zh.png`, `landing-en.png`, `design.png`.

## Gotchas
- The `/` language depends on the **browser context locale**: an en-US context gets English on `/`. Always set the locale explicitly.
- Translations come from `messages/{zh,en}/landing.json`. A copy change there breaks the title regexes; update them from the JSON, not from memory.
