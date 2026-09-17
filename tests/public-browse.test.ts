import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('public visitor path', () => {
  it('has a read-only browser mode and anonymous policies for public content', async () => {
    const runtime = await readFile(new URL('../src/views/shell-runtime.ts', import.meta.url), 'utf8');
    const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
    const migration = await readFile(new URL('../supabase/migrations/014_public_browse_and_themes.sql', import.meta.url), 'utf8');
    const leastPrivilege = await readFile(new URL('../supabase/migrations/016_least_privilege_public_reads.sql', import.meta.url), 'utf8');
    const mediaPrivacy = await readFile(new URL('../supabase/migrations/017_private_media_access.sql', import.meta.url), 'utf8');
    const projections = await readFile(new URL('../src/lib/public-projections.ts', import.meta.url), 'utf8');
    const store = await readFile(new URL('../src/lib/social-store.ts', import.meta.url), 'utf8');
    expect(runtime).toContain('renderPublicBrowse');
    expect(runtime).toContain('publicFeed');
    expect(main).toContain('Browse public posts');
    expect(migration).toContain('for select to anon');
    expect(migration).not.toMatch(/grant select on table public\.(profiles|posts|media_assets|groups)/i);
    expect(migration).toContain('for select to anon');
    expect(leastPrivilege).toContain('revoke all privileges on table public.profiles, public.posts, public.media_assets, public.groups from anon;');
    expect(leastPrivilege).toContain('grant select (id, kind, display_name, handle, bio, avatar_url, banner_url, visibility, theme, profile_style, created_at)');
    expect(leastPrivilege).toContain('grant select (id, author_id, group_id, body, visibility, ai_generated, media_ids, created_at)');
    expect(leastPrivilege).toContain('grant select (id, object_path, public_url, kind, created_at)');
    expect(leastPrivilege).toContain('grant select (id, name, handle, description, rules, visibility, created_at)');
    expect(leastPrivilege).not.toMatch(/grant select on table public\.(profiles|posts|media_assets|groups)/i);
    expect(projections).toContain("export const PUBLIC_PROFILE_FIELDS = 'id,kind,display_name,handle,bio,avatar_url,banner_url,visibility,theme,profile_style,created_at'");
    expect(projections).toContain("export const PUBLIC_MEDIA_FIELDS = 'id,object_path,public_url,kind,created_at'");
    expect(projections).not.toMatch(/owner_id|inbox_address|moderation_hidden|provider|bytes/);
    expect(store).toContain("select(PUBLIC_POST_WITH_AUTHOR)");
    expect(mediaPrivacy).toContain("set public = false");
    expect(mediaPrivacy).toContain('private.can_read_media_object(name)');
    expect(mediaPrivacy).toContain('drop policy if exists media_read_public on storage.objects');
    expect(mediaPrivacy).toContain('grant execute on function private.can_read_media_object(text) to anon, authenticated');
    expect(mediaPrivacy).toContain("visibility = 'friends' and public.are_profiles_friends(auth.uid(), posts.author_id)");
    expect(mediaPrivacy).not.toContain('grant select on table storage.objects to public');
    expect(migration).toContain("visibility = 'public'");
    expect(migration).not.toContain('for insert to anon');
    expect(migration).not.toContain('for update to anon');
    expect(migration).not.toContain('for delete to anon');
  });

  it('never lets a follow relationship override a friends-only post boundary', async () => {
    const mediaPrivacy = await readFile(new URL('../supabase/migrations/017_private_media_access.sql', import.meta.url), 'utf8');
    const policyStart = mediaPrivacy.indexOf('create policy posts_read on public.posts');
    expect(policyStart).toBeGreaterThanOrEqual(0);
    const postsPolicy = mediaPrivacy.slice(policyStart);

    expect(postsPolicy).toContain("visibility = 'public'");
    expect(postsPolicy).toContain("visibility = 'friends' and public.are_profiles_friends(auth.uid(), posts.author_id)");
    expect(postsPolicy).not.toMatch(/\bpublic\.follows\b|\bfrom follows\b/i);
    expect(postsPolicy).toContain('not public.is_blocked_between(auth.uid(), posts.author_id)');
  });
});
