# Claude Handoff: Deploy Stock Monitor to EdgeOne and Bind osbornalpha.com

## Goal

Deploy `gilosbornhello/stock-monitor` to Tencent EdgeOne Pages/Makers and bind the custom domain:

```text
osbornalpha.com
www.osbornalpha.com
```

The user wants the site reachable from both mainland China and overseas.

## Repository State

GitHub repository:

```text
https://github.com/gilosbornhello/stock-monitor
```

Feature branch already pushed:

```text
feat/portfolio-pdf-report-edgeone
```

Pull request:

```text
https://github.com/gilosbornhello/stock-monitor/pull/20
```

Latest commit on the branch:

```text
1d9dbb1 feat: add portfolio PDF report skill and EdgeOne docs
```

Merge PR #20 first, or deploy this feature branch directly for preview.

## Important Context

This is a Next.js full-stack app with API routes and Supabase SSR auth. Do not deploy it as a static export.

Use EdgeOne Pages/Makers with Next.js framework support.

The local EdgeOne CLI is logged in:

```text
Account Name: 陈斌
Account ID: 100044132677
APPID: 1377872589
```

I attempted direct CLI deployment:

```bash
edgeone pages deploy . --name stock-monitor-osbornalpha --area global --env production
```

It created or referenced:

```text
Project name: stock-monitor-osbornalpha
Project ID: makers-qmwzqzzrugh4
```

But the upload stalled at 99% and was interrupted before returning a deployment URL. Treat this as not successfully deployed. Prefer GitHub import from the EdgeOne console instead of direct upload, because the project is a Next.js app and the local folder may contain large build/dependency directories.

## Recommended EdgeOne Deployment Steps

1. Open EdgeOne Pages/Makers console.
2. Create/import project from GitHub:

```text
https://github.com/gilosbornhello/stock-monitor
```

3. Choose branch:

```text
main
```

If PR #20 is not merged yet, choose:

```text
feat/portfolio-pdf-report-edgeone
```

4. Configure build:

```text
Framework: Next.js
Install command: npm install
Build command: npm run build
Output directory: leave empty / framework default
Node.js version: 20 or 22
Region / area: Global
```

5. Add environment variables before production deploy.

Required:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_GUEST_MODE_ALLOWED
```

For production domain:

```text
NEXT_PUBLIC_APP_URL=https://osbornalpha.com
NEXT_PUBLIC_GUEST_MODE_ALLOWED=true
```

Optional but recommended if features are enabled:

```text
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
ANTHROPIC_API_KEY
LLM_PROVIDER
TUSHARE_TOKEN
ALPHAVANTAGE_API_KEY
```

6. Deploy and verify the EdgeOne preview URL.

Minimum checks:

```text
/
/watchlist
/stock/00700.HK
/api/search?q=腾讯
/api/quote/00700.HK
```

Some API routes may degrade if optional data-provider keys are absent; record which ones depend on missing keys.

## Bind osbornalpha.com

After the EdgeOne deployment works:

1. In EdgeOne Pages/Makers, open the project domain settings.
2. Add custom domain:

```text
osbornalpha.com
```

3. Add another domain:

```text
www.osbornalpha.com
```

4. Follow the ownership verification record shown by the console.

Expected DNS patterns are usually one or more of:

```text
TXT verification record
CNAME from www to EdgeOne target
CNAME flattening / ALIAS / ANAME for apex domain, if DNS provider supports it
EdgeOne DNS nameserver migration, if apex CNAME is not available
```

Do not guess the target hostname. Use the exact value shown in the EdgeOne console.

5. Enable HTTPS / auto certificate.
6. Configure redirects:

Recommended canonical:

```text
https://osbornalpha.com
```

Redirect:

```text
https://www.osbornalpha.com -> https://osbornalpha.com
http://* -> https://*
```

7. Update project env var after final domain is bound:

```text
NEXT_PUBLIC_APP_URL=https://osbornalpha.com
```

8. Redeploy.

## Verification After Domain Binding

Run:

```bash
curl -I https://osbornalpha.com
curl -I https://www.osbornalpha.com
curl -s https://osbornalpha.com/api/search?q=腾讯 | head
```

Browser checks:

- Home page loads over HTTPS.
- Login/unlock pages load.
- Watchlist page loads.
- A stock detail page loads.
- API route requests do not fail due to wrong origin.
- Mobile viewport renders without horizontal breakage.

## Existing Local Verification

Already verified locally before handoff:

```bash
npm run typecheck
npm run build
```

Both passed.

Also verified the new PDF report skill:

```bash
python3 skills/portfolio-pdf-report/scripts/generate_portfolio_report.py /Users/gilbertchen/Downloads/portfolio3_2026-06-16.pdf -o tmp/portfolio_report_test
```

Output:

```text
positions=134 options=6 fx=9 market=11
```

## Known Warnings

`npm install` reported:

```text
next@14.2.18 has a security vulnerability
3 npm audit vulnerabilities: 1 moderate, 1 high, 1 critical
```

Do not silently run `npm audit fix --force` in production work. Upgrade Next/dependencies in a separate tested PR.
