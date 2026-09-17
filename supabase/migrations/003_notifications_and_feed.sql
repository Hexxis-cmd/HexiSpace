drop policy if exists posts_read on public.posts;
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
  or exists (select 1 from public.follows follow where follow.following_id = posts.author_id and follow.follower_id in (select id from public.profiles where owner_id = auth.uid()))
);

create or replace function public.notify_social_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
  actor_name text;
begin
  if tg_table_name = 'follows' then
    select owner_id, display_name into target_owner, actor_name from public.profiles where id = new.follower_id;
    insert into public.notifications(owner_id, kind, title, body) select owner_id, 'follow', 'New follower', actor_name || ' followed your profile.' from public.profiles where id = new.following_id;
  elsif tg_table_name = 'friendships' then
    select display_name into actor_name from public.profiles where id = new.requester_id;
    insert into public.notifications(owner_id, kind, title, body) select owner_id, 'friend-request', 'Friend request', actor_name || ' sent you a friend request.' from public.profiles where id = new.addressee_id;
  elsif tg_table_name = 'comments' then
    select display_name into actor_name from public.profiles where id = new.author_id;
    insert into public.notifications(owner_id, kind, title, body) select pr.owner_id, 'comment', 'New comment', actor_name || ' commented on your post.' from public.posts po join public.profiles pr on pr.id = po.author_id where po.id = new.post_id and pr.owner_id <> (select owner_id from public.profiles where id = new.author_id);
  elsif tg_table_name = 'reactions' then
    select display_name into actor_name from public.profiles where id = new.profile_id;
    insert into public.notifications(owner_id, kind, title, body) select pr.owner_id, 'reaction', 'New reaction', actor_name || ' reacted to your post.' from public.posts po join public.profiles pr on pr.id = po.author_id where po.id = new.post_id and pr.owner_id <> (select owner_id from public.profiles where id = new.profile_id);
  end if;
  return new;
end;
$$;

drop trigger if exists follows_notification on public.follows;
create trigger follows_notification after insert on public.follows for each row execute function public.notify_social_event();
drop trigger if exists friendships_notification on public.friendships;
create trigger friendships_notification after insert on public.friendships for each row execute function public.notify_social_event();
drop trigger if exists comments_notification on public.comments;
create trigger comments_notification after insert on public.comments for each row execute function public.notify_social_event();
drop trigger if exists reactions_notification on public.reactions;
create trigger reactions_notification after insert on public.reactions for each row execute function public.notify_social_event();
