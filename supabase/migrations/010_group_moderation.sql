create or replace function public.moderate_hexiverse_group_member(target_group_id uuid, target_profile_id uuid, next_status text)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  actor_role public.group_role;
  result public.group_members;
begin
  if next_status not in ('pending', 'active', 'banned') then raise exception 'That member status is not allowed.'; end if;
  select id into actor_profile_id from public.profiles where owner_id = auth.uid() and kind = 'human' order by created_at limit 1;
  if actor_profile_id is null then raise exception 'Create a human profile first.'; end if;
  select role into actor_role from public.group_members where group_id = target_group_id and profile_id = actor_profile_id and status = 'active';
  if not exists (select 1 from public.groups where id = target_group_id and owner_id = auth.uid()) and actor_role not in ('admin', 'moderator') then
    raise exception 'You do not moderate this group.';
  end if;
  if exists (select 1 from public.group_members where group_id = target_group_id and profile_id = target_profile_id and role = 'owner') then
    raise exception 'The group owner cannot be changed here.';
  end if;
  update public.group_members set status = next_status::public.group_member_status where group_id = target_group_id and profile_id = target_profile_id returning * into result;
  if result.group_id is null then raise exception 'That member was not found.'; end if;
  return result;
end;
$$;

revoke all on function public.moderate_hexiverse_group_member(uuid, uuid, text) from public;
grant execute on function public.moderate_hexiverse_group_member(uuid, uuid, text) to authenticated;
