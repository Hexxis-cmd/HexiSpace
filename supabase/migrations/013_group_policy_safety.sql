-- Keep group and membership policies from recursively querying each other.
-- These helpers evaluate relationship checks as the database owner; the
-- caller still receives only rows allowed by the policy at the boundary.

create or replace function public.can_view_group(p_viewer_id uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.visibility in ('public', 'approval')
        or g.owner_id = p_viewer_id
        or exists (
          select 1
          from public.group_members gm
          join public.profiles p on p.id = gm.profile_id
          where gm.group_id = g.id
            and gm.status = 'active'
            and p.owner_id = p_viewer_id
        )
      )
  );
$$;

create or replace function public.can_view_group_member(
  p_viewer_id uuid,
  p_group_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.owner_id = p_viewer_id
  )
  or exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_id = p_viewer_id
  )
  or exists (
    select 1
    from public.group_members own
    join public.profiles p on p.id = own.profile_id
    where own.group_id = p_group_id
      and own.status = 'active'
      and p.owner_id = p_viewer_id
  );
$$;

revoke all on function public.can_view_group(uuid, uuid) from public;
revoke all on function public.can_view_group_member(uuid, uuid, uuid) from public;
grant execute on function public.can_view_group(uuid, uuid) to authenticated;
grant execute on function public.can_view_group_member(uuid, uuid, uuid) to authenticated;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
for select to authenticated
using (public.can_view_group(auth.uid(), id));

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
for select to authenticated
using (public.can_view_group_member(auth.uid(), group_id, profile_id));
