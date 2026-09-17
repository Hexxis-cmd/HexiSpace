-- Keep profile visibility and public content from bypassing a user's block list.
create or replace function public.is_blocked_between(viewer_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks b
    where b.owner_id = viewer_id and b.blocked_profile_id = target_profile_id
  ) or exists (
    select 1
    from public.profiles target
    join public.blocks b on b.owner_id = target.owner_id
    join public.profiles blocked on blocked.id = b.blocked_profile_id
    where target.id = target_profile_id and blocked.owner_id = viewer_id
  );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Keep the profile policy from querying profiles through its own RLS policy.
-- This helper runs with the database owner's rights and only returns the
-- boolean relationship needed by the policy.
create or replace function public.are_profiles_friends(viewer_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.accepted and (
      (f.requester_id = target_profile_id and exists (select 1 from public.profiles p where p.id = f.addressee_id and p.owner_id = viewer_id))
      or (f.addressee_id = target_profile_id and exists (select 1 from public.profiles p where p.id = f.requester_id and p.owner_id = viewer_id))
    )
  );
$$;

revoke all on function public.are_profiles_friends(uuid, uuid) from public;
grant execute on function public.are_profiles_friends(uuid, uuid) to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  not public.is_blocked_between(auth.uid(), profiles.id)
  and (visibility = 'public' or owner_id = auth.uid() or public.are_profiles_friends(auth.uid(), profiles.id))
);

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (
  not public.is_blocked_between(auth.uid(), posts.author_id)
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
);

drop policy if exists comments_read_visible_post on public.comments;
create policy comments_read_visible_post on public.comments for select to authenticated using (
  not public.is_blocked_between(auth.uid(), comments.author_id)
  and exists (select 1 from public.posts p where p.id = comments.post_id)
);
