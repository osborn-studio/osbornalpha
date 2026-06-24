-- Per-user LLM settings: stores the provider, model, and an AES-256-GCM ciphertext
-- of the user's API key. Encryption/decryption happens server-side via
-- src/lib/llm/crypto.ts; the database only ever sees the ciphertext. RLS scopes
-- every row to its owning auth.users.id so users can only read/write their own
-- LLM configuration.

create table public.llm_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  provider       text not null,
  model          text not null,
  api_key_cipher text not null,
  updated_at     timestamptz not null default now()
);

alter table public.llm_settings enable row level security;

create policy "llm own select" on public.llm_settings
  for select using (auth.uid() = user_id);

create policy "llm own insert" on public.llm_settings
  for insert with check (auth.uid() = user_id);

create policy "llm own update" on public.llm_settings
  for update using (auth.uid() = user_id);
