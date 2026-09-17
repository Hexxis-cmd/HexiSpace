-- Private Storage plus short-lived signed URLs prevent copied public URLs from
-- bypassing profile and post visibility. Existing object paths are preserved.

update storage.buckets
set public = false
where id = 'public-media';

drop policy if exists media_read_public on storage.objects;
drop policy if exists media_object_read_visible on storage.objects;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.can_read_media_object(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
set row_security = off
as $function$
  select exists (
    select 1
    from public.media_assets media
    where media.object_path = p_object_path
      and media.provider = 'supabase'
      and split_part(media.object_path, '/', 1) = media.owner_id::text
      and cardinality(string_to_array(media.object_path, '/')) = 2
      and (
        media.owner_id = auth.uid()
        or (
          not media.moderation_hidden
          and (
            exists (
              select 1
              from public.profiles profile
              where (profile.avatar_url = media.public_url or profile.banner_url = media.public_url)
                and not profile.moderation_hidden
                and (
                  profile.visibility = 'public'
                  or profile.owner_id = auth.uid()
                  or (profile.visibility = 'friends' and auth.uid() is not null and public.are_profiles_friends(auth.uid(), profile.id))
                )
                and (auth.uid() is null or not public.is_blocked_between(auth.uid(), profile.id))
            )
            or exists (
              select 1
              from public.posts post
              join public.profiles author on author.id = post.author_id
              where media.id = any(post.media_ids)
                and not post.moderation_hidden
                and (
                  author.owner_id = auth.uid()
                  or (post.visibility = 'public' and (auth.uid() is not null or (author.visibility = 'public' and not author.moderation_hidden)))
                  or (post.visibility = 'friends' and auth.uid() is not null and public.are_profiles_friends(auth.uid(), author.id))
                )
                and (auth.uid() is null or not public.is_blocked_between(auth.uid(), author.id))
            )
          )
        )
      )
  );
$function$;

revoke all on function private.can_read_media_object(text) from public, anon, authenticated;
grant execute on function private.can_read_media_object(text) to anon, authenticated;

create policy media_object_read_visible on storage.objects
for select to anon, authenticated
using (bucket_id = 'public-media' and private.can_read_media_object(name));

drop policy if exists media_public_browse on public.media_assets;
drop policy if exists media_read_published on public.media_assets;
drop policy if exists media_assets_read_visible on public.media_assets;
create policy media_assets_read_visible on public.media_assets
for select to anon, authenticated
using (private.can_read_media_object(object_path));

-- Following a profile must not reveal content the author marked friends-only.
-- Public posts remain available to followers through their public visibility.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
for select to authenticated
using (
  (not moderation_hidden or author_id in (select id from public.profiles where owner_id = auth.uid()))
  and not public.is_blocked_between(auth.uid(), posts.author_id)
  and (
    visibility = 'public'
    or author_id in (select id from public.profiles where owner_id = auth.uid())
    or (visibility = 'friends' and public.are_profiles_friends(auth.uid(), posts.author_id))
  )
);

-- The client asks before uploading or signing any project-owned media. If this
-- migration is missing, partially applied, or later weakened, the client must
-- fail closed instead of trusting a public bucket or permissive post policy.
create or replace function public.hexispace_media_security_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1 from storage.buckets bucket
    where bucket.id = 'public-media' and bucket.public = false
  )
  and to_regprocedure('private.can_read_media_object(text)') is not null
  and exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'media_object_read_visible'
      and policy.cmd = 'SELECT'
      and 'anon' = any(policy.roles)
      and 'authenticated' = any(policy.roles)
  )
  and not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.cmd = 'SELECT'
      and 'public' = any(policy.roles)
  )
  -- Storage policies are permissive by default: an additional anon or
  -- authenticated SELECT policy is ORed with the visibility check above.
  -- This app currently has one client-readable bucket, so fail closed if any
  -- other client-readable object policy appears (including one scoped to a
  -- bucket that may later be repurposed).
  and not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.cmd in ('SELECT', 'ALL')
      and policy.roles && array['public'::name, 'anon'::name, 'authenticated'::name]
      and policy.policyname <> 'media_object_read_visible'
  )
  and exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'media_assets'
      and policy.policyname = 'media_assets_read_visible'
      and policy.cmd = 'SELECT'
      and 'anon' = any(policy.roles)
      and 'authenticated' = any(policy.roles)
  )
  and exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'posts'
      and policy.policyname = 'posts_read'
      and policy.cmd = 'SELECT'
      and 'authenticated' = any(policy.roles)
      and position('are_profiles_friends' in lower(coalesce(policy.qual, ''))) > 0
      and position('follows' in lower(coalesce(policy.qual, ''))) = 0
  );
$function$;

revoke all on function public.hexispace_media_security_ready() from public, anon, authenticated;
grant execute on function public.hexispace_media_security_ready() to anon, authenticated;
