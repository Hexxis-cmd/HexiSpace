-- Keep the authentication-account UUID and private Hexonaut inbox address out
-- of direct profile reads. Ownership is enforced by RLS and exposed to the
-- signed-in owner only through narrowly scoped functions.

revoke all privileges on table public.profiles from anon, authenticated;
revoke select (id, owner_id, kind, display_name, handle, bio, avatar_url, banner_url, visibility, theme, created_at, inbox_address, moderation_hidden, profile_style)
  on table public.profiles from anon, authenticated;

grant select (id, kind, display_name, handle, bio, avatar_url, banner_url, visibility, theme, profile_style, created_at)
  on table public.profiles to anon, authenticated;
grant insert (owner_id, kind, display_name, handle, bio, avatar_url, banner_url, visibility, theme, profile_style)
  on table public.profiles to authenticated;
grant update (display_name, bio, avatar_url, banner_url, visibility, theme, profile_style)
  on table public.profiles to authenticated;
grant delete on table public.profiles to authenticated;

create or replace function public.my_profiles()
returns table (
  id uuid,
  kind public.profile_kind,
  display_name text,
  handle text,
  bio text,
  avatar_url text,
  banner_url text,
  visibility public.visibility,
  theme text,
  profile_style jsonb,
  inbox_address text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select profile.id, profile.kind, profile.display_name, profile.handle, profile.bio,
         profile.avatar_url, profile.banner_url, profile.visibility, profile.theme,
         profile.profile_style, profile.inbox_address, profile.created_at
  from public.profiles profile
  where profile.owner_id = auth.uid()
  order by profile.created_at, profile.id
$function$;

create or replace function public.resolve_hexonaut_inbox(p_address text)
returns table (profile_id uuid, kind public.profile_kind)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select profile.id, profile.kind
  from public.profiles profile
  where auth.uid() is not null
    and p_address is not null
    and pg_catalog.char_length(p_address) <= 255
    and pg_catalog.lower(pg_catalog.btrim(profile.inbox_address)) = pg_catalog.lower(pg_catalog.btrim(p_address))
    and profile.kind = 'hexonaut'::public.profile_kind
    and not profile.moderation_hidden
    and not public.is_blocked_between(auth.uid(), profile.id)
    and (
      profile.owner_id = auth.uid()
      or profile.visibility = 'public'::public.visibility
      or (profile.visibility = 'friends'::public.visibility and public.are_profiles_friends(auth.uid(), profile.id))
    )
  limit 1
$function$;

revoke all on function public.my_profiles() from public, anon;
revoke all on function public.resolve_hexonaut_inbox(text) from public, anon;
grant execute on function public.my_profiles() to authenticated;
grant execute on function public.resolve_hexonaut_inbox(text) to authenticated;

-- RLS must not query profiles from a policy on profiles. It must also avoid
-- requiring clients to read owner_id merely to prove that an actor owns a
-- profile. This private, boolean-only helper covers both cases.
create or replace function private.is_my_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id and profile.owner_id = auth.uid()
  )
$function$;

create or replace function private.is_my_hexonaut(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id
      and profile.owner_id = auth.uid()
      and profile.kind = 'hexonaut'::public.profile_kind
  )
$function$;

create or replace function private.can_receive_hexonaut_mail(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.kind = 'hexonaut'::public.profile_kind
      and not profile.moderation_hidden
      and not public.is_blocked_between(auth.uid(), profile.id)
      and (
        profile.owner_id = auth.uid()
        or profile.visibility = 'public'::public.visibility
        or (profile.visibility = 'friends'::public.visibility
          and public.are_profiles_friends(auth.uid(), profile.id))
      )
  )
$function$;

revoke all on function private.is_my_profile(uuid) from public, anon;
revoke all on function private.is_my_hexonaut(uuid) from public, anon;
revoke all on function private.can_receive_hexonaut_mail(uuid) from public, anon;
grant execute on function private.is_my_profile(uuid) to authenticated;
grant execute on function private.is_my_hexonaut(uuid) to authenticated;
grant execute on function private.can_receive_hexonaut_mail(uuid) to authenticated;

-- Inbox names are derived from a Hexonaut's unique handle. Clients cannot
-- claim a different address or give a Human profile an agent inbox.
create or replace function private.assign_profile_inbox_address()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.kind = 'hexonaut'::public.profile_kind then
    new.inbox_address := pg_catalog.lower(new.handle) || '@inbox.hexispace.local';
  else
    new.inbox_address := null;
  end if;
  return new;
end
$function$;

revoke all on function private.assign_profile_inbox_address() from public, anon, authenticated;
drop trigger if exists profiles_assign_inbox_address on public.profiles;
create trigger profiles_assign_inbox_address
before insert or update of kind, handle on public.profiles
for each row execute function private.assign_profile_inbox_address();

-- These two helpers are used by RLS and must remain safe when the profile
-- ownership column is no longer selectable by an ordinary client.
create or replace function public.is_blocked_between(viewer_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select exists (
    select 1 from public.blocks block
    where block.owner_id = viewer_id and block.blocked_profile_id = target_profile_id
  ) or exists (
    select 1
    from public.profiles target
    join public.blocks block on block.owner_id = target.owner_id
    join public.profiles blocked on blocked.id = block.blocked_profile_id
    where target.id = target_profile_id and blocked.owner_id = viewer_id
  )
$function$;

create or replace function public.are_profiles_friends(viewer_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select exists (
    select 1
    from public.friendships friendship
    where friendship.accepted and (
      (friendship.requester_id = target_profile_id and exists (
        select 1 from public.profiles profile
        where profile.id = friendship.addressee_id and profile.owner_id = viewer_id
      ))
      or (friendship.addressee_id = target_profile_id and exists (
        select 1 from public.profiles profile
        where profile.id = friendship.requester_id and profile.owner_id = viewer_id
      ))
    )
  )
$function$;

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke all on function public.are_profiles_friends(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.are_profiles_friends(uuid, uuid) to authenticated;

-- Replace client-facing policies that previously queried profiles.owner_id.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  (not moderation_hidden or private.is_my_profile(id))
  and not public.is_blocked_between(auth.uid(), id)
  and (visibility = 'public' or private.is_my_profile(id)
    or public.are_profiles_friends(auth.uid(), id))
);

drop policy if exists follows_participant on public.follows;
create policy follows_participant on public.follows for all to authenticated
using (private.is_my_profile(follower_id) or private.is_my_profile(following_id))
with check (private.is_my_profile(follower_id));

drop policy if exists friendships_participant on public.friendships;
create policy friendships_participant on public.friendships for all to authenticated
using (private.is_my_profile(requester_id) or private.is_my_profile(addressee_id))
with check (private.is_my_profile(requester_id));

drop policy if exists posts_owner_write on public.posts;
create policy posts_owner_write on public.posts for all to authenticated
using (private.is_my_profile(author_id))
with check (private.is_my_profile(author_id) and (group_id is null or exists (
  select 1 from public.group_members member
  where member.group_id = posts.group_id and member.profile_id = posts.author_id
    and member.status = 'active' and member.can_post
)));

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (
  (not moderation_hidden or private.is_my_profile(author_id))
  and not public.is_blocked_between(auth.uid(), author_id)
  and (
    (group_id is null and (
      visibility = 'public'
      or private.is_my_profile(author_id)
      or (visibility = 'friends' and public.are_profiles_friends(auth.uid(), author_id))
    ))
    or (group_id is not null and exists (
      select 1 from public.groups community
      where community.id = posts.group_id and (
        community.visibility in ('public', 'approval')
        or community.owner_id = auth.uid()
        or exists (
          select 1 from public.group_members member
          where member.group_id = community.id and member.status = 'active'
            and private.is_my_profile(member.profile_id)
        )
      )
    ))
  )
);

drop policy if exists room_members_access on public.room_members;
create policy room_members_access on public.room_members for select to authenticated using (
  private.is_my_profile(profile_id)
  or room_id in (select id from public.rooms where owner_id = auth.uid())
);

drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated using (
  not moderation_hidden
  and (room_id in (select room_id from public.room_members where private.is_my_profile(profile_id))
    or room_id in (select id from public.rooms where owner_id = auth.uid()))
);

drop policy if exists messages_member_write on public.messages;
create policy messages_member_write on public.messages for insert to authenticated with check (
  private.is_my_profile(author_id)
  and (room_id in (select room_id from public.room_members
      where profile_id = messages.author_id and can_write)
    or room_id in (select id from public.rooms where owner_id = auth.uid()))
);

drop policy if exists encrypted_keys_member on public.encrypted_room_keys;
create policy encrypted_keys_member on public.encrypted_room_keys for all to authenticated
using (private.is_my_profile(profile_id) or room_id in (select id from public.rooms where owner_id = auth.uid()))
with check (private.is_my_profile(profile_id) or room_id in (select id from public.rooms where owner_id = auth.uid()));

drop policy if exists comments_owner_write on public.comments;
create policy comments_owner_write on public.comments for all to authenticated
using (private.is_my_profile(author_id))
with check (private.is_my_profile(author_id)
  and exists (select 1 from public.posts post where post.id = comments.post_id));

drop policy if exists reactions_owner_write on public.reactions;
create policy reactions_owner_write on public.reactions for all to authenticated
using (private.is_my_profile(profile_id))
with check (private.is_my_profile(profile_id)
  and exists (select 1 from public.posts post where post.id = reactions.post_id));

drop policy if exists scheduled_tasks_owner on public.scheduled_tasks;
create policy scheduled_tasks_owner on public.scheduled_tasks for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and private.is_my_hexonaut(hexonaut_id));

drop policy if exists device_keys_owner on public.profile_device_keys;
create policy device_keys_owner on public.profile_device_keys for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and private.is_my_profile(profile_id));

drop policy if exists gift_sends_participant_read on public.gift_sends;
create policy gift_sends_participant_read on public.gift_sends for select to authenticated using (
  private.is_my_profile(sender_profile_id) or private.is_my_profile(recipient_profile_id)
);

drop policy if exists hexonaut_mail_recipient_read on public.hexonaut_mail;
create policy hexonaut_mail_recipient_read on public.hexonaut_mail for select to authenticated using (
  private.is_my_profile(recipient_profile_id) or private.is_my_profile(sender_profile_id)
);

drop policy if exists hexonaut_mail_recipient_update on public.hexonaut_mail;
create policy hexonaut_mail_recipient_update on public.hexonaut_mail for update to authenticated
using (private.is_my_profile(recipient_profile_id))
with check (private.is_my_profile(recipient_profile_id));

drop policy if exists hexonaut_mail_sender_insert on public.hexonaut_mail;
create policy hexonaut_mail_sender_insert on public.hexonaut_mail for insert to authenticated with check (
  private.is_my_profile(sender_profile_id)
  and private.can_receive_hexonaut_mail(recipient_profile_id)
);

drop policy if exists mailbox_connections_owner on public.mailbox_connections;
create policy mailbox_connections_owner on public.mailbox_connections for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and private.is_my_hexonaut(profile_id));
