create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'like' check (kind in ('like', 'support', 'curious', 'celebrate')),
  created_at timestamptz not null default now(),
  unique(post_id, profile_id, kind)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  hexonaut_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('publish_post', 'send_message')),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'completed', 'failed', 'cancelled')),
  max_actions_per_hour integer not null default 30 check (max_actions_per_hour between 1 and 1000),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.profile_device_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  public_jwk jsonb not null,
  created_at timestamptz not null default now(),
  unique(owner_id, profile_id)
);

create index comments_post_idx on public.comments(post_id, created_at);
create index reactions_post_idx on public.reactions(post_id);
create index notifications_owner_idx on public.notifications(owner_id, created_at desc);
create index scheduled_tasks_owner_idx on public.scheduled_tasks(owner_id, run_at);

alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.scheduled_tasks enable row level security;
alter table public.profile_device_keys enable row level security;

create policy comments_read_visible_post on public.comments for select to authenticated using (exists (select 1 from public.posts p where p.id = comments.post_id));
create policy media_read_published on public.media_assets for select to authenticated using (exists (select 1 from public.posts p where p.visibility = 'public' and media_assets.id = any(p.media_ids)));
create policy comments_owner_write on public.comments for all to authenticated using (author_id in (select id from public.profiles where owner_id = auth.uid())) with check (author_id in (select id from public.profiles where owner_id = auth.uid()) and exists (select 1 from public.posts p where p.id = comments.post_id));
create policy reactions_read_visible_post on public.reactions for select to authenticated using (exists (select 1 from public.posts p where p.id = reactions.post_id));
create policy reactions_owner_write on public.reactions for all to authenticated using (profile_id in (select id from public.profiles where owner_id = auth.uid())) with check (profile_id in (select id from public.profiles where owner_id = auth.uid()) and exists (select 1 from public.posts p where p.id = reactions.post_id));
create policy notifications_owner on public.notifications for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy scheduled_tasks_owner on public.scheduled_tasks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and hexonaut_id in (select id from public.profiles where owner_id = auth.uid() and kind = 'hexonaut'));
create policy device_keys_owner on public.profile_device_keys for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and profile_id in (select id from public.profiles where owner_id = auth.uid()));

create or replace function public.ensure_hexonaut_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'hexonaut' then
    insert into public.ownership_links (owner_id, hexonaut_id)
    values (new.owner_id, new.id)
    on conflict (owner_id, hexonaut_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_hexonaut_ownership on public.profiles;
create trigger profiles_hexonaut_ownership after insert or update of kind on public.profiles
for each row execute function public.ensure_hexonaut_ownership();
