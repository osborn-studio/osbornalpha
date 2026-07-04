-- timezone '' = auto (follow browser). The old default 'Asia/Shanghai' was never
-- user-chosen (field had zero readers/writers before G2) — reset to auto.
alter table public.user_preferences alter column timezone set default '';
update public.user_preferences set timezone = '' where timezone = 'Asia/Shanghai';
