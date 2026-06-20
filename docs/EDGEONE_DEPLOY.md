# EdgeOne Pages Deployment

This project is a Next.js full-stack app with API routes and Supabase SSR auth. Deploy it to Tencent EdgeOne Pages/Makers as a Next.js project, not as a static export.

## Recommended Path: GitHub Import

1. Push the latest `main` branch to GitHub.
2. Open EdgeOne Pages/Makers.
3. Create a project by importing:

```text
https://github.com/gilosbornhello/stock-monitor
```

4. Select the deployment branch:

```text
main
```

5. Use these build settings:

```text
Framework: Next.js
Install command: npm install
Build command: npm run build
Output directory: leave empty / framework default
Node.js version: 20 or 22
```

6. Add environment variables before the first production deployment.

## Required Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_GUEST_MODE_ALLOWED
```

Optional, depending on enabled data and AI features:

```text
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
ANTHROPIC_API_KEY
LLM_PROVIDER
TUSHARE_TOKEN
ALPHAVANTAGE_API_KEY
```

For production, set:

```text
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
```

## Domain

After the preview deployment is verified, add your custom domain in EdgeOne Pages/Makers domain management.

Recommended setup:

```text
stock.YOUR_DOMAIN
```

If your DNS is already hosted in Tencent EdgeOne DNS, add the domain there and follow the CNAME/verification record shown by the EdgeOne console. Enable HTTPS after ownership verification.

## Cron Routes

The repository currently has Vercel cron definitions in `vercel.json`:

```text
/api/cron/daily-radar
/api/cron/daily-brief
```

Do not assume EdgeOne will read `vercel.json` cron syntax. Recreate these schedules in EdgeOne if/when the console supports scheduled tasks for the selected project type, or trigger them from an external scheduler.

## Local Preflight

Run before deploying:

```bash
npm install
npm run typecheck
npm run build
```

If the build fails because of missing environment variables, add placeholder public Supabase values for build-time checks, then set real values in EdgeOne before production.

## Notes

- EdgeOne Pages/Makers supports Next.js full-stack deployments, including App Router, API routes, SSR, ISR, SSG, React Server Components, and route handlers.
- The app still depends on Supabase and third-party APIs at runtime; EdgeOne hosts the app but does not replace those services.
- For reliable access in both mainland China and overseas, prefer an EdgeOne-managed custom domain with HTTPS enabled.
