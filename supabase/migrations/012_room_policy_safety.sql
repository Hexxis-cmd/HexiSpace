-- Prevent room visibility checks from recursing through room_members policies.
-- The helper reads the relationship as the database owner, while the policy
-- still applies the caller's moderation and membership rules at the boundary.

create or replace function public.can_view_room(p_viewer_id uuid, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and (
        r.owner_id = p_viewer_id
        or exists (
          select 1
          from public.room_members rm
          join public.profiles p on p.id = rm.profile_id
          where rm.room_id = r.id
            and p.owner_id = p_viewer_id
        )
      )
  );
$$;

revoke all on function public.can_view_room(uuid, uuid) from public;
grant execute on function public.can_view_room(uuid, uuid) to authenticated;

drop policy if exists rooms_read_visible on public.rooms;
create policy rooms_read_visible on public.rooms
for select to authenticated
using (
  public.can_view_room(auth.uid(), id)
  and (not moderation_hidden or owner_id = auth.uid())
);
