create extension if not exists pgcrypto;

create type public.profile_kind as enum ('human', 'hexonaut');
create type public.visibility as enum ('private', 'friends', 'public');
create type public.room_kind as enum ('protected', 'encrypted');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind public.profile_kind not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  handle text not null unique check (handle ~ '^[A-Za-z0-9_]{2,30}$'),
  bio text not null default '' check (char_length(bio) <= 2000),
  avatar_url text,
  banner_url text,
  visibility public.visibility not null default 'private',
  theme text not null default 'dark' check (theme in ('dark', 'light', 'prism', 'parchment')),
  created_at timestamptz not null default now()
);

create table public.ownership_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  hexonaut_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(owner_id, hexonaut_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  unique(requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  visibility public.visibility not null default 'private',
  ai_generated boolean not null default false,
  media_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or cardinality(media_ids) > 0)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('supabase', 'google-drive', 'cloudinary', 's3-compatible')),
  object_path text not null,
  public_url text not null,
  kind text not null check (kind in ('image', 'video', 'audio')),
  bytes bigint not null check (bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind public.room_kind not null default 'protected',
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  can_write boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  ciphertext text,
  created_at timestamptz not null default now(),
  check ((ciphertext is null and char_length(body) > 0) or (ciphertext is not null and body = ''))
);

create table public.encrypted_room_keys (
  room_id uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  wrapped_key text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create table public.agent_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  hexonaut_id uuid not null references public.profiles(id) on delete cascade,
  capabilities text[] not null default '{}',
  rooms uuid[] not null default '{}',
  expires_at timestamptz,
  max_actions_per_hour integer not null default 30 check (max_actions_per_hour between 1 and 1000),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.connector_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (char_length(connector) between 1 and 80),
  scopes text[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  status text not null check (status in ('started', 'completed', 'blocked', 'failed')),
  detail text not null default '' check (char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'post', 'message', 'room', 'media')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table public.blocks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, blocked_profile_id)
);

create index posts_created_at_idx on public.posts(created_at desc);
create index posts_author_idx on public.posts(author_id, created_at desc);
create index messages_room_idx on public.messages(room_id, created_at);
create index profiles_owner_idx on public.profiles(owner_id);

alter table public.profiles enable row level security;
alter table public.ownership_links enable row level security;
alter table public.follows enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.media_assets enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.encrypted_room_keys enable row level security;
alter table public.agent_grants enable row level security;
alter table public.connector_links enable row level security;
alter table public.audit_receipts enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  visibility = 'public' or owner_id = auth.uid() or exists (
    select 1 from public.friendships f
    where f.accepted and ((f.requester_id = profiles.id and f.addressee_id in (select id from public.profiles where owner_id = auth.uid())) or (f.addressee_id = profiles.id and f.requester_id in (select id from public.profiles where owner_id = auth.uid())))
  )
);
create policy profiles_owner_write on public.profiles for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ownership_owner on public.ownership_links for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy follows_participant on public.follows for all to authenticated using (follower_id in (select id from public.profiles where owner_id = auth.uid()) or following_id in (select id from public.profiles where owner_id = auth.uid())) with check (follower_id in (select id from public.profiles where owner_id = auth.uid()));
create policy friendships_participant on public.friendships for all to authenticated using (requester_id in (select id from public.profiles where owner_id = auth.uid()) or addressee_id in (select id from public.profiles where owner_id = auth.uid())) with check (requester_id in (select id from public.profiles where owner_id = auth.uid()));
create policy posts_read on public.posts for select to authenticated using (
  visibility = 'public'
  or author_id in (select id from public.profiles where owner_id = auth.uid())
  or (
    visibility = 'friends'
    and exists (
      select 1
      from public.friendships f
      where f.accepted
        and (
          (f.requester_id = posts.author_id and f.addressee_id in (select id from public.profiles where owner_id = auth.uid()))
          or (f.addressee_id = posts.author_id and f.requester_id in (select id from public.profiles where owner_id = auth.uid()))
        )
    )
  )
);
create policy posts_owner_write on public.posts for all to authenticated using (author_id in (select id from public.profiles where owner_id = auth.uid())) with check (author_id in (select id from public.profiles where owner_id = auth.uid()));
create policy media_owner on public.media_assets for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy rooms_owner on public.rooms for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy room_members_access on public.room_members for select to authenticated using (profile_id in (select id from public.profiles where owner_id = auth.uid()) or room_id in (select id from public.rooms where owner_id = auth.uid()));
create policy room_members_owner_write on public.room_members for all to authenticated using (room_id in (select id from public.rooms where owner_id = auth.uid())) with check (room_id in (select id from public.rooms where owner_id = auth.uid()));
create policy messages_member_read on public.messages for select to authenticated using (room_id in (select room_id from public.room_members where profile_id in (select id from public.profiles where owner_id = auth.uid())) or room_id in (select id from public.rooms where owner_id = auth.uid()));
create policy messages_member_write on public.messages for insert to authenticated with check (author_id in (select id from public.profiles where owner_id = auth.uid()) and (room_id in (select room_id from public.room_members where profile_id = author_id and can_write) or room_id in (select id from public.rooms where owner_id = auth.uid())));
create policy encrypted_keys_member on public.encrypted_room_keys for all to authenticated using (profile_id in (select id from public.profiles where owner_id = auth.uid()) or room_id in (select id from public.rooms where owner_id = auth.uid())) with check (profile_id in (select id from public.profiles where owner_id = auth.uid()) or room_id in (select id from public.rooms where owner_id = auth.uid()));
create policy grants_owner on public.agent_grants for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy links_owner on public.connector_links for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy receipts_owner on public.audit_receipts for select to authenticated using (owner_id = auth.uid());
create policy reports_creator on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_owner_read on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy blocks_owner on public.blocks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public) values ('public-media', 'public-media', true) on conflict (id) do nothing;
create policy media_upload_own_folder on storage.objects for insert to authenticated with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete_own_folder on storage.objects for delete to authenticated using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_read_public on storage.objects for select to public using (bucket_id = 'public-media');
