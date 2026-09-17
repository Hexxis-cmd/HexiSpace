-- Public browsing is read-only. Anonymous visitors can see only public, non-hidden content.
-- Private profiles, relationships, rooms, messages, reports, and agent data remain authenticated-only.

-- Anonymous field-level SELECT grants are added separately in migration 016,
-- after these row policies exist. Do not grant table-wide SELECT here.

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme in (
  'dark', 'light', 'prism', 'parchment', 'obsidian', 'aurora',
  'pulse', 'orbit', 'flux', 'halo', 'ember', 'tidal'
));

-- Public policies need to inspect moderation fields without granting those
-- fields to anonymous clients. Keep the check inside narrowly scoped helpers.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_public_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  select exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id
      and profile.visibility = 'public'
      and not profile.moderation_hidden
  );
$function$;

revoke all on function private.is_public_profile(uuid) from public, anon, authenticated;
grant execute on function private.is_public_profile(uuid) to anon, authenticated;

create or replace function private.can_browse_public_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  select exists (
    select 1
    from public.media_assets media
    join public.posts post on media.id = any(post.media_ids)
    join public.profiles author on author.id = post.author_id
    where media.id = p_media_id
      and not media.moderation_hidden
      and post.visibility = 'public'
      and not post.moderation_hidden
      and author.visibility = 'public'
      and not author.moderation_hidden
  );
$function$;

revoke all on function private.can_browse_public_media(uuid) from public, anon, authenticated;
grant execute on function private.can_browse_public_media(uuid) to anon, authenticated;

drop policy if exists profiles_public_browse on public.profiles;
create policy profiles_public_browse on public.profiles
for select to anon
using (visibility = 'public' and not moderation_hidden);

drop policy if exists posts_public_browse on public.posts;
create policy posts_public_browse on public.posts
for select to anon
using (
  visibility = 'public'
  and not moderation_hidden
  and private.is_public_profile(posts.author_id)
);

drop policy if exists media_public_browse on public.media_assets;
create policy media_public_browse on public.media_assets
for select to anon, authenticated
using (private.can_browse_public_media(media_assets.id));

drop policy if exists groups_public_browse on public.groups;
create policy groups_public_browse on public.groups
for select to anon
using (visibility in ('public', 'approval'));
