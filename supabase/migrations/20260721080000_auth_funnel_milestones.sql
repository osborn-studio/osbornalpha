-- Auth conversion milestones are emitted repeatedly by clients but counted once per user.
create unique index if not exists user_events_unique_auth_milestone
  on public.user_events (user_id, event_name)
  where user_id is not null
    and event_name in ('email_confirmation_succeeded', 'first_login_succeeded');
