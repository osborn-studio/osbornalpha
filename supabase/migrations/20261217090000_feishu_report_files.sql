-- Private bucket for the Feishu simulation workbook (飞书模拟组合报告). The connector uploads with
-- its own token through /api/integrations/feishu/reports; browsers download through
-- /analyst/report/files/<name> after a session check. No storage policies: only the
-- service role reads or writes these objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feishu-reports', 'feishu-reports', false, 5242880,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
set public = false, name = excluded.name, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
