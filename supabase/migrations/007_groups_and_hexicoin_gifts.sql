create type public.group_visibility as enum ('public', 'approval', 'private', 'hidden');
create type public.group_role as enum ('owner', 'admin', 'moderator', 'member');
create type public.group_member_status as enum ('pending', 'active', 'banned');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  handle text not null unique check (handle ~ '^[a-z0-9_]{2,30}$'),
  description text not null default '' check (char_length(description) <= 2000),
  rules text not null default '' check (char_length(rules) <= 4000),
  visibility public.group_visibility not null default 'public',
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null default 'member',
  status public.group_member_status not null default 'pending',
  can_post boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

alter table public.posts add column if not exists group_id uuid references public.groups(id) on delete cascade;
create index groups_owner_idx on public.groups(owner_id);
create index group_members_profile_idx on public.group_members(profile_id, status);
create index posts_group_idx on public.posts(group_id, created_at desc);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy groups_read on public.groups for select to authenticated using (
  visibility in ('public', 'approval')
  or owner_id = auth.uid()
  or exists (select 1 from public.group_members gm join public.profiles p on p.id = gm.profile_id where gm.group_id = groups.id and gm.status = 'active' and p.owner_id = auth.uid())
);
create policy groups_owner_write on public.groups for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy group_members_read on public.group_members for select to authenticated using (
  profile_id in (select id from public.profiles where owner_id = auth.uid())
  or group_id in (select id from public.groups where owner_id = auth.uid())
  or exists (select 1 from public.group_members own where own.group_id = group_members.group_id and own.profile_id in (select id from public.profiles where owner_id = auth.uid()) and own.status = 'active')
);
create policy group_members_owner_write on public.group_members for all to authenticated using (group_id in (select id from public.groups where owner_id = auth.uid())) with check (group_id in (select id from public.groups where owner_id = auth.uid()));

create or replace function public.join_hexiverse_group(target_group_id uuid, joining_profile_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group public.groups;
  result public.group_members;
  requested_status public.group_member_status;
begin
  if not exists (select 1 from public.profiles where id = joining_profile_id and owner_id = auth.uid()) then
    raise exception 'That profile is not owned by the signed-in user.';
  end if;
  select * into target_group from public.groups where id = target_group_id;
  if target_group.id is null or target_group.visibility in ('private', 'hidden') then
    raise exception 'This group is not accepting public joins.';
  end if;
  requested_status := case when target_group.visibility = 'approval' then 'pending'::public.group_member_status else 'active'::public.group_member_status end;
  insert into public.group_members(group_id, profile_id, role, status)
  values (target_group_id, joining_profile_id, 'member', requested_status)
  on conflict (group_id, profile_id) do update set status = excluded.status
  returning * into result;
  return result;
end;
$$;
revoke all on function public.join_hexiverse_group(uuid, uuid) from public;
grant execute on function public.join_hexiverse_group(uuid, uuid) to authenticated;

create or replace function public.set_hexiverse_group_role(target_group_id uuid, target_profile_id uuid, new_role text)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.group_members;
begin
  if new_role not in ('admin', 'moderator', 'member') then raise exception 'That group role is not allowed.'; end if;
  if not exists (select 1 from public.groups where id = target_group_id and owner_id = auth.uid()) then raise exception 'Only the group owner can change roles.'; end if;
  update public.group_members set role = new_role::public.group_role where group_id = target_group_id and profile_id = target_profile_id returning * into result;
  if result.group_id is null then raise exception 'That profile is not a member of this group.'; end if;
  return result;
end;
$$;
revoke all on function public.set_hexiverse_group_role(uuid, uuid, text) from public;
grant execute on function public.set_hexiverse_group_role(uuid, uuid, text) to authenticated;

drop policy if exists posts_owner_write on public.posts;
create policy posts_owner_write on public.posts for all to authenticated using (
  author_id in (select id from public.profiles where owner_id = auth.uid())
) with check (
  author_id in (select id from public.profiles where owner_id = auth.uid())
  and (group_id is null or exists (select 1 from public.group_members gm where gm.group_id = posts.group_id and gm.profile_id = posts.author_id and gm.status = 'active' and gm.can_post))
);
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (
  not public.is_blocked_between(auth.uid(), posts.author_id)
  and (
    (
      group_id is null
      and (
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
        or exists (select 1 from public.follows follow where follow.following_id = posts.author_id and follow.follower_id in (select id from public.profiles where owner_id = auth.uid()))
      )
    )
    or (
      group_id is not null
      and exists (
        select 1
        from public.groups g
        where g.id = posts.group_id
          and (
            g.visibility in ('public', 'approval')
            or g.owner_id = auth.uid()
            or exists (
              select 1
              from public.group_members gm
              join public.profiles p on p.id = gm.profile_id
              where gm.group_id = g.id and gm.status = 'active' and p.owner_id = auth.uid()
            )
          )
      )
    )
  )
);

create table public.hexicoin_wallets (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);
create table public.hexicoin_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (char_length(reason) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  gift_key text not null unique check (gift_key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  cost integer not null check (cost between 1 and 10000),
  icon text not null check (char_length(icon) between 1 and 12),
  enabled boolean not null default true
);
create table public.gift_sends (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  gift_id uuid not null references public.gift_catalog(id),
  quantity integer not null check (quantity between 1 and 20),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (sender_profile_id <> recipient_profile_id)
);
create index gift_sends_recipient_idx on public.gift_sends(recipient_profile_id, created_at desc);
alter table public.hexicoin_wallets enable row level security;
alter table public.hexicoin_ledger enable row level security;
alter table public.gift_catalog enable row level security;
alter table public.gift_sends enable row level security;
create policy wallet_owner_read on public.hexicoin_wallets for select to authenticated using (owner_id = auth.uid());
create policy ledger_owner_read on public.hexicoin_ledger for select to authenticated using (owner_id = auth.uid());
create policy gift_catalog_read on public.gift_catalog for select to authenticated using (enabled = true);
create policy gift_sends_participant_read on public.gift_sends for select to authenticated using (sender_profile_id in (select id from public.profiles where owner_id = auth.uid()) or recipient_profile_id in (select id from public.profiles where owner_id = auth.uid()));

insert into public.gift_catalog(gift_key, name, description, cost, icon) values
  ('signal', 'Signal', 'A small hello for someone you appreciate.', 5, '✦'),
  ('spark', 'Spark', 'A bright little boost for a great post.', 10, '✧'),
  ('orbit', 'Orbit', 'A gift that says: keep going.', 25, '◈'),
  ('constellation', 'Constellation', 'A bigger thank-you made of many points of light.', 50, '✺')
on conflict (gift_key) do nothing;

create or replace function public.ensure_hexicoin_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hexicoin_wallets(owner_id, balance) values (new.owner_id, 100) on conflict (owner_id) do nothing;
  if found then insert into public.hexicoin_ledger(owner_id, delta, reason) values (new.owner_id, 100, 'alpha_starter_credits'); end if;
  return new;
end;
$$;
drop trigger if exists profiles_hexicoin_wallet on public.profiles;
create trigger profiles_hexicoin_wallet after insert on public.profiles for each row execute function public.ensure_hexicoin_wallet();

create or replace function public.send_hexicoin_gift(sender_profile_id uuid, recipient_profile_id uuid, requested_gift_key text, gift_quantity integer, gift_note text)
returns public.gift_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_owner uuid;
  gift public.gift_catalog;
  result public.gift_sends;
  total integer;
begin
  select owner_id into sender_owner from public.profiles where id = sender_profile_id;
  if sender_owner is null or sender_owner <> auth.uid() then raise exception 'The sender profile is not owned by the signed-in user.'; end if;
  if sender_profile_id = recipient_profile_id then raise exception 'A profile cannot send a gift to itself.'; end if;
  if not exists (select 1 from public.profiles where id = recipient_profile_id) then raise exception 'That recipient could not be found.'; end if;
  if public.is_blocked_between(auth.uid(), recipient_profile_id) then raise exception 'This profile is unavailable.'; end if;
  select * into gift from public.gift_catalog gc where gc.gift_key = requested_gift_key and gc.enabled = true;
  if gift.id is null then raise exception 'That gift is not available.'; end if;
  total := gift.cost * greatest(1, least(20, gift_quantity));
  update public.hexicoin_wallets set balance = balance - total where owner_id = sender_owner and balance >= total;
  if not found then raise exception 'Not enough HexiCoins for that gift.'; end if;
  insert into public.hexicoin_ledger(owner_id, delta, reason) values (sender_owner, -total, 'gift:' || gift.gift_key);
  insert into public.gift_sends(sender_profile_id, recipient_profile_id, gift_id, quantity, note) values (sender_profile_id, recipient_profile_id, gift.id, greatest(1, least(20, gift_quantity)), left(coalesce(gift_note, ''), 300)) returning * into result;
  insert into public.notifications(owner_id, kind, title, body) select p.owner_id, 'gift', 'You received a gift', (select display_name from public.profiles where id = sender_profile_id) || ' sent you a ' || gift.name || '.' from public.profiles p where p.id = recipient_profile_id;
  return result;
end;
$$;
revoke all on function public.send_hexicoin_gift(uuid, uuid, text, integer, text) from public;
grant execute on function public.send_hexicoin_gift(uuid, uuid, text, integer, text) to authenticated;
