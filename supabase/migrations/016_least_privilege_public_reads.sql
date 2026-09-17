-- Anonymous browsing is read-only and exposes only fields needed to render public content.
-- Row-level policies from 014 remain the row boundary; these column grants are the field boundary.

revoke all privileges on table public.profiles, public.posts, public.media_assets, public.groups from anon;

grant select (id, kind, display_name, handle, bio, avatar_url, banner_url, visibility, theme, profile_style, created_at)
  on table public.profiles to anon;
grant select (id, author_id, group_id, body, visibility, ai_generated, media_ids, created_at)
  on table public.posts to anon;
grant select (id, object_path, public_url, kind, created_at)
  on table public.media_assets to anon;
grant select (id, name, handle, description, rules, visibility, created_at)
  on table public.groups to anon;
