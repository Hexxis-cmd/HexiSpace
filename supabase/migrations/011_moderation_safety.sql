-- Moderation safety layer. Actions are reversible soft-hides, not silent deletion.

alter table public.profiles add column if not exists moderation_hidden boolean not null default false;
alter table public.posts add column if not exists moderation_hidden boolean not null default false;
alter table public.comments add column if not exists moderation_hidden boolean not null default false;
alter table public.rooms add column if not exists moderation_hidden boolean not null default false;
alter table public.messages add column if not exists moderation_hidden boolean not null default false;
alter table public.media_assets add column if not exists moderation_hidden boolean not null default false;

alter table public.reports add column if not exists updated_at timestamptz not null default now();
alter table public.reports add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists resolution_note text not null default '' check (char_length(resolution_note) <= 2000);
alter table public.reports add column if not exists action text not null default 'none' check (action in ('none', 'hide', 'unhide', 'dismiss'));

create table if not exists public.rate_limit_buckets (
  actor_id uuid not null,
  action text not null check (char_length(action) between 1 and 80),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (actor_id, action, window_start)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_rate_limit(actor uuid, bucket_action text, max_count integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket timestamptz;
  current_count integer;
begin
  if actor is null or max_count < 1 or window_seconds < 1 then
    return false;
  end if;
  bucket := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limit_buckets(actor_id, action, window_start, count)
  values (actor, bucket_action, bucket, 1)
  on conflict (actor_id, action, window_start)
  do update set count = public.rate_limit_buckets.count + 1
  returning count into current_count;
  return current_count <= max_count;
end;
$$;

create or replace function public.report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.consume_rate_limit(new.reporter_id, 'report', 5, 3600) then
    raise exception 'Too many reports. Please wait before sending another.';
  end if;
  return new;
end;
$$;

create or replace function public.profile_content_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.profiles where id = new.author_id;
  if not public.consume_rate_limit(coalesce(owner, new.author_id), tg_table_name, case when tg_table_name = 'comments' then 120 else 300 end, 3600) then
    raise exception 'This action is temporarily limited. Please wait and try again.';
  end if;
  return new;
end;
$$;

create or replace function public.message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.profiles where id = new.author_id;
  if not public.consume_rate_limit(coalesce(owner, new.author_id), 'messages', 240, 3600) then
    raise exception 'Too many messages in a short time. Please wait before sending more.';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports
for each row execute function public.report_rate_limit();

drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit before insert on public.posts
for each row execute function public.profile_content_rate_limit();

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments
for each row execute function public.profile_content_rate_limit();

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages
for each row execute function public.message_rate_limit();

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  (not moderation_hidden or owner_id = auth.uid())
  and not public.is_blocked_between(auth.uid(), profiles.id)
  and (visibility = 'public' or owner_id = auth.uid() or exists (
    select 1 from public.friendships f
    where f.accepted and ((f.requester_id = profiles.id and f.addressee_id in (select id from public.profiles where owner_id = auth.uid())) or (f.addressee_id = profiles.id and f.requester_id in (select id from public.profiles where owner_id = auth.uid())))
  ))
);

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (
  (not moderation_hidden or author_id in (select id from public.profiles where owner_id = auth.uid()))
  and not public.is_blocked_between(auth.uid(), posts.author_id)
  and (
    visibility = 'public'
    or author_id in (select id from public.profiles where owner_id = auth.uid())
    or (visibility = 'friends' and exists (select 1 from public.friendships f where f.accepted and ((f.requester_id = posts.author_id and f.addressee_id in (select id from public.profiles where owner_id = auth.uid())) or (f.addressee_id = posts.author_id and f.requester_id in (select id from public.profiles where owner_id = auth.uid())))))
    or exists (select 1 from public.follows follow where follow.following_id = posts.author_id and follow.follower_id in (select id from public.profiles where owner_id = auth.uid()))
  )
);

drop policy if exists comments_read_visible_post on public.comments;
create policy comments_read_visible_post on public.comments for select to authenticated using (
  (not moderation_hidden or author_id in (select id from public.profiles where owner_id = auth.uid()))
  and not public.is_blocked_between(auth.uid(), comments.author_id)
  and exists (select 1 from public.posts p where p.id = comments.post_id and not p.moderation_hidden)
);

drop policy if exists media_read_published on public.media_assets;
create policy media_read_published on public.media_assets for select to authenticated using (
  not moderation_hidden
  and exists (select 1 from public.posts p where p.visibility = 'public' and not p.moderation_hidden and media_assets.id = any(p.media_ids))
);

drop policy if exists rooms_read_visible on public.rooms;
create policy rooms_read_visible on public.rooms for select to authenticated using (
  (not moderation_hidden or owner_id = auth.uid())
  and (owner_id = auth.uid() or id in (
    select room_id from public.room_members
    where profile_id in (select id from public.profiles where owner_id = auth.uid())
  ))
);

drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated using (
  not moderation_hidden
  and (room_id in (select room_id from public.room_members where profile_id in (select id from public.profiles where owner_id = auth.uid()))
    or room_id in (select id from public.rooms where owner_id = auth.uid()))
);

drop policy if exists reports_creator on public.reports;
create policy reports_creator on public.reports for insert to authenticated with check (
  reporter_id = auth.uid()
  and ((target_type = 'profile' and exists (select 1 from public.profiles where id = target_id))
    or (target_type = 'post' and exists (select 1 from public.posts where id = target_id))
    or (target_type = 'message' and exists (select 1 from public.messages where id = target_id))
    or (target_type = 'room' and exists (select 1 from public.rooms where id = target_id))
    or (target_type = 'media' and exists (select 1 from public.media_assets where id = target_id)))
);

drop function if exists public.admin_list_reports();
create or replace function public.admin_list_reports()
returns table (
  id uuid,
  reporter_id uuid,
  reporter_label text,
  target_type text,
  target_id uuid,
  target_label text,
  target_excerpt text,
  reason text,
  status text,
  action text,
  resolution_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id,
    r.reporter_id,
    coalesce((select p.display_name from public.profiles p where p.owner_id = r.reporter_id and p.kind = 'human' order by p.created_at limit 1), 'Account') as reporter_label,
    r.target_type,
    r.target_id,
    case
      when r.target_type = 'profile' then coalesce((select p.display_name from public.profiles p where p.id = r.target_id), 'Profile unavailable')
      when r.target_type = 'post' then coalesce((select p.display_name from public.profiles p join public.posts po on po.author_id = p.id where po.id = r.target_id), 'Post unavailable')
      else r.target_type
    end as target_label,
    case
      when r.target_type = 'profile' then coalesce((select left(p.bio, 240) from public.profiles p where p.id = r.target_id), '')
      when r.target_type = 'post' then coalesce((select left(po.body, 240) from public.posts po where po.id = r.target_id), '')
      else 'Open the linked record to review this report.'
    end as target_excerpt,
    r.reason, r.status, r.action, r.resolution_note, r.created_at, r.updated_at
  from public.reports r
  where exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
  order by r.created_at desc
  limit 500;
$$;

create or replace function public.admin_moderate_report(report_id uuid, decision text, note text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.reports;
  clean_note text := left(coalesce(note, ''), 2000);
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then raise exception 'Not authorized'; end if;
  if decision not in ('hide', 'unhide', 'dismiss') then raise exception 'Invalid moderation decision'; end if;
  select * into item from public.reports where id = report_id;
  if item.id is null then raise exception 'Report not found'; end if;
  if decision = 'hide' then
    if item.target_type = 'profile' then update public.profiles set moderation_hidden = true where id = item.target_id;
    elsif item.target_type = 'post' then update public.posts set moderation_hidden = true where id = item.target_id;
    elsif item.target_type = 'message' then update public.messages set moderation_hidden = true where id = item.target_id;
    elsif item.target_type = 'room' then update public.rooms set moderation_hidden = true where id = item.target_id;
    elsif item.target_type = 'media' then raise exception 'Media reports require provider-level review because public media URLs cannot be revoked by a database flag.';
    else raise exception 'This report target does not support reversible hiding.';
    end if;
  elsif decision = 'unhide' then
    if item.target_type = 'profile' then update public.profiles set moderation_hidden = false where id = item.target_id;
    elsif item.target_type = 'post' then update public.posts set moderation_hidden = false where id = item.target_id;
    elsif item.target_type = 'message' then update public.messages set moderation_hidden = false where id = item.target_id;
    elsif item.target_type = 'room' then update public.rooms set moderation_hidden = false where id = item.target_id;
    elsif item.target_type = 'media' then raise exception 'Media reports require provider-level review because public media URLs cannot be revoked by a database flag.';
    else raise exception 'This report target does not support reversible hiding.';
    end if;
  end if;
  update public.reports set status = case when decision = 'dismiss' then 'dismissed' else 'resolved' end, action = decision, reviewed_by = auth.uid(), resolution_note = clean_note, updated_at = now() where id = report_id;
  insert into public.audit_receipts(owner_id, action, status, detail) values (auth.uid(), 'moderation.' || decision, 'completed', left(item.target_type || ':' || item.target_id::text || ' ' || clean_note, 1000));
  return found;
end;
$$;

create or replace function public.admin_update_report_status(report_id uuid, next_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then raise exception 'Not authorized'; end if;
  if next_status not in ('open', 'reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report status'; end if;
  update public.reports set status = next_status, reviewed_by = auth.uid(), updated_at = now() where id = report_id;
  return found;
end;
$$;

create or replace function public.admin_purge_moderation_data(retention_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
  days_to_keep integer := greatest(coalesce(retention_days, 180), 30);
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then raise exception 'Not authorized'; end if;
  delete from public.reports where status in ('resolved', 'dismissed') and updated_at < now() - make_interval(days => days_to_keep);
  get diagnostics removed = row_count;
  delete from public.rate_limit_buckets where window_start < now() - interval '2 days';
  delete from public.audit_receipts where action like 'moderation.%' and created_at < now() - interval '365 days';
  return removed;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_reports() from public, anon;
revoke all on function public.admin_moderate_report(uuid, text, text) from public, anon;
revoke all on function public.admin_update_report_status(uuid, text) from public, anon;
revoke all on function public.admin_purge_moderation_data(integer) from public, anon;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_moderate_report(uuid, text, text) to authenticated;
grant execute on function public.admin_update_report_status(uuid, text) to authenticated;
grant execute on function public.admin_purge_moderation_data(integer) to authenticated;
