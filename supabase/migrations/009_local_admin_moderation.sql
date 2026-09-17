create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.admin_list_reports()
returns table (id uuid, reporter_id uuid, target_type text, target_id uuid, reason text, status text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select r.id, r.reporter_id, r.target_type, r.target_id, r.reason, r.status, r.created_at::timestamptz
  from public.reports r
  where exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
  order by r.created_at desc
  limit 500;
$$;

create or replace function public.admin_update_report_status(report_id uuid, next_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  if next_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;
  update public.reports set status = next_status where id = report_id;
  return found;
end;
$$;

revoke all on table public.platform_admins from public, anon, authenticated;
revoke all on function public.admin_list_reports() from public, anon;
revoke all on function public.admin_update_report_status(uuid, text) from public, anon;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_update_report_status(uuid, text) to authenticated;
