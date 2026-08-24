# Multi-Provider LLM Config (BYO-key) — Design Spec

> Status: approved 2026-06-24. Unblocks John Cameron (copilot) on 火山引擎 ARK and
> adds a per-user provider/key config in Settings. Built via the OSStack loop.

## Problem
The copilot (`/api/copilot`) hard-depends on Anthropic's tool-use API, but there is
no working Anthropic key — so John Cameron can't run. The user wants to use 火山引擎
ARK (and others), configured per-user in the web app (BYO-key), not via env-only.

## Decisions
- **Storage:** per-user, in Supabase, **BYO-key** (multi-tenant best practice).
- **Providers (all OpenAI-compatible):** `ark` (default), `deepseek`, `openai`, `kimi` (Moonshot), `minimax`. Anthropic dropped from the switcher; the copilot moves to a single OpenAI-function-calling path.
- **Key security:** AES-256-GCM encrypted at rest (server `LLM_ENC_KEY`), RLS-isolated, **write-only** (never returned to the client).

## Architecture (`src/lib/llm/*`)
1. **`providers.ts`** — registry: `{ id, label, baseUrl, defaultModel, chatPath? }` for the 5 providers. `chatPath` defaults `/chat/completions`; MiniMax uses `/text/chatcompletion_v2` (verify dialect).
2. **`crypto.ts`** — `encrypt(plain): string` / `decrypt(cipher): string` using AES-256-GCM with `process.env.LLM_ENC_KEY` (32-byte, base64). Format `iv.tag.ciphertext` base64. Round-trip tested.
3. **`openai-compat.ts`** — one client param'd by `{ baseUrl, apiKey, model, chatPath }`:
   - `chat(opts)` — text (returns `{content, usage}`).
   - `toolChat({ system, messages, tools, max_tokens })` — OpenAI function-calling; returns `{ content, tool_calls: [{id,name,arguments}], finish_reason, usage }`.
4. **`settings-store.ts`** (server) — `getUserLlm(userId)` / `setUserLlm(userId, {provider, model, apiKeyCipher})` against Supabase.
5. **`resolve.ts`** — `resolveLlm(userId?)`: load user row → decrypt key → `{ provider, baseUrl, model, apiKey, chatPath }`; **fallback to env** (`ARK_API_KEY`/`LLM_PROVIDER`/`LLM_MODEL`) when no row. `null` if nothing configured.

## Supabase
Migration `supabase/migrations/<ts>_llm_settings.sql`:
```sql
create table public.llm_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null,
  model text not null,
  api_key_cipher text not null,
  updated_at timestamptz not null default now()
);
alter table public.llm_settings enable row level security;
create policy "own row select" on public.llm_settings for select using (auth.uid() = user_id);
create policy "own row upsert" on public.llm_settings for insert with check (auth.uid() = user_id);
create policy "own row update" on public.llm_settings for update using (auth.uid() = user_id);
```
*(User applies the migration in Supabase; the API key is never selected back to the client.)*

## API + UI
- **`/api/llm/settings`** — `GET` returns `{ provider, model, configured: boolean }` (NO key). `POST {provider, model, apiKey}` → encrypt + upsert.
- **`/api/llm/test`** — `POST {provider, model, apiKey?}` → 1-token ping via `openai-compat.chat`; returns `{ ok, latencyMs, error? }`.
- **`/settings` "AI 模型" section** — provider `<select>`; API-key `<input type=password>` (write-only; shows "已配置 ✓ ••••" when set); model `<input>` (prefilled default); **测试连接** button; save. Inspired by Vox's flow, web-native.
- **`/api/copilot`** — replace `anthropicToolChat` with the resolved provider's `toolChat`; loop maps OpenAI `tool_calls` ↔ tool registry the same way. If unconfigured → stream a friendly "请在设置中配置 AI Provider" error.

## Out of scope / user actions
- Applying the Supabase migration; setting `LLM_ENC_KEY` in Vercel; entering the ARK key in Settings. (I never handle the raw key.)
- Anthropic remains usable elsewhere (perspectives) but is not in the copilot switcher.

## Testing
Unit: providers registry shape; crypto round-trip + tamper-fail; openai-compat tool_call parsing (stubbed fetch). Integration: copilot loop with a stubbed `toolChat` returning a scripted tool_call → verdict.

## Also (small, bundled)
Watchlist discoverability: default the 股票池 view to **表格** (or remember last choice) so the 4-column table isn't buried behind the kanban default.
