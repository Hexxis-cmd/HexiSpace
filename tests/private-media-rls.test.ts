import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const follower = '00000000-0000-4000-8000-000000000002';
const friend = '00000000-0000-4000-8000-000000000003';
const ownerProfile = '10000000-0000-4000-8000-000000000001';
const followerProfile = '10000000-0000-4000-8000-000000000002';
const friendProfile = '10000000-0000-4000-8000-000000000003';
const friendsOnlyProfile = '10000000-0000-4000-8000-000000000004';
const publicMedia = '20000000-0000-4000-8000-000000000001';
const friendsMedia = '20000000-0000-4000-8000-000000000002';
const privateMedia = '20000000-0000-4000-8000-000000000003';
const hiddenMedia = '20000000-0000-4000-8000-000000000004';
const malformedMedia = '20000000-0000-4000-8000-000000000005';
const profileMedia = '20000000-0000-4000-8000-000000000006';
const publicPost = '30000000-0000-4000-8000-000000000001';
const friendsPost = '30000000-0000-4000-8000-000000000002';
const privatePost = '30000000-0000-4000-8000-000000000003';
const hiddenPost = '30000000-0000-4000-8000-000000000004';
const publicGroup = '40000000-0000-4000-8000-000000000001';
const approvalGroup = '40000000-0000-4000-8000-000000000002';
const privateGroup = '40000000-0000-4000-8000-000000000003';
const publicPath = `${owner}/public.png`;
const friendsPath = `${owner}/friends.png`;
const privatePath = `${owner}/private.png`;
const hiddenPath = `${owner}/hidden.png`;
const malformedPath = `${owner}/nested/folder.png`;
const profilePath = `${owner}/friends-avatar.png`;
const publicUrl = `https://example.test/storage/v1/object/public/public-media/${publicPath}`;
const friendsUrl = `https://example.test/storage/v1/object/public/public-media/${friendsPath}`;
const profileUrl = `https://example.test/storage/v1/object/public/public-media/${profilePath}`;

let db: PGlite;

async function asRole<T>(role: 'anon' | 'authenticated', userId: string | null, query: string, params: unknown[] = []) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.query(`set role ${role}`);
  try {
    return await db.query<T>(query, params);
  } finally {
    await db.query('reset role');
  }
}

async function visibleObject(role: 'anon' | 'authenticated', userId: string | null, path: string) {
  const result = await asRole<{ name: string }>(role, userId,
    'select name from storage.objects where bucket_id = $1 and name = $2', ['public-media', path]);
  return result.rows.length > 0;
}

async function visiblePostIds(userId: string) {
  const result = await asRole<{ id: string }>('authenticated', userId,
    'select id from public.posts order by id');
  return result.rows.map(({ id }) => id);
}

async function visibleAnonymousPostIds() {
  const result = await asRole<{ id: string }>('anon', null,
    'select id from public.posts order by id');
  return result.rows.map(({ id }) => id);
}

async function visibleAnonymousGroupHandles() {
  const result = await asRole<{ handle: string }>('anon', null,
    'select handle from public.groups order by handle');
  return result.rows.map(({ handle }) => handle);
}

async function visibleAsset(role: 'anon' | 'authenticated', userId: string | null, id: string) {
  const result = await asRole<{ id: string }>(role, userId,
    'select id from public.media_assets where id = $1', [id]);
  return result.rows.length > 0;
}

describe('private media and feed policies against PostgreSQL RLS', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth, storage, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;

      create table public.profiles (
        id uuid primary key,
        owner_id uuid not null,
        kind text not null default 'human',
        display_name text not null default 'Person',
        handle text not null default 'person',
        bio text not null default '',
        avatar_url text,
        banner_url text,
        visibility text not null,
        theme text not null default 'dark',
        profile_style jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        moderation_hidden boolean not null default false
      );
      create table public.follows (follower_id uuid not null, following_id uuid not null);
      create table public.friendships (
        requester_id uuid not null,
        addressee_id uuid not null,
        accepted boolean not null default false
      );
      create table public.blocks (owner_id uuid not null, blocked_profile_id uuid not null);
      create table public.posts (
        id uuid primary key,
        author_id uuid not null,
        group_id uuid,
        body text not null default '',
        visibility text not null,
        ai_generated boolean not null default false,
        media_ids uuid[] not null default '{}',
        created_at timestamptz not null default now(),
        moderation_hidden boolean not null default false
      );
      create table public.comments (
        id uuid primary key,
        author_id uuid not null,
        post_id uuid not null,
        moderation_hidden boolean not null default false
      );
      create table public.media_assets (
        id uuid primary key,
        owner_id uuid not null,
        provider text not null,
        object_path text not null,
        public_url text not null,
        kind text not null default 'image',
        created_at timestamptz not null default now(),
        moderation_hidden boolean not null default false
      );
      create table public.groups (
        id uuid primary key,
        name text not null,
        handle text not null,
        description text not null default '',
        rules text not null default '',
        visibility text not null,
        created_at timestamptz not null default now()
      );
      create table storage.buckets (id text primary key, name text not null, public boolean not null);
      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text not null,
        name text not null
      );
      alter table public.profiles enable row level security;
      alter table public.posts enable row level security;
      alter table public.comments enable row level security;
      alter table public.media_assets enable row level security;
      alter table public.groups enable row level security;
      alter table storage.objects enable row level security;
      grant select on public.profiles, public.posts to authenticated;
      grant select on public.groups to authenticated;
      grant select on public.media_assets, storage.objects to anon, authenticated;
      insert into storage.buckets (id, name, public) values ('public-media', 'public-media', true);
      create policy media_read_public on storage.objects for select to public using (bucket_id = 'public-media');
    `);

    const friendAndBlockFunctions = await readFile(new URL('../supabase/migrations/006_profile_safety.sql', import.meta.url), 'utf8');
    await db.exec(friendAndBlockFunctions);
    for (const migrationName of [
      '014_public_browse_and_themes.sql',
      '015_greek_deity_themes.sql',
      '016_least_privilege_public_reads.sql',
    ]) {
      const migration = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
      await db.exec(migration);
    }

    await db.exec(`
      insert into public.profiles (id, owner_id, avatar_url, visibility) values
        ('${ownerProfile}', '${owner}', '${publicUrl}', 'public'),
        ('${followerProfile}', '${follower}', null, 'public'),
        ('${friendProfile}', '${friend}', null, 'public'),
        ('${friendsOnlyProfile}', '${owner}', '${profileUrl}', 'friends');
      insert into public.follows (follower_id, following_id) values ('${followerProfile}', '${ownerProfile}');
      insert into public.friendships (requester_id, addressee_id, accepted) values
        ('${ownerProfile}', '${friendProfile}', true),
        ('${friendsOnlyProfile}', '${friendProfile}', true);
      insert into public.groups (id, name, handle, visibility) values
        ('${publicGroup}', 'Public group', 'public-group', 'public'),
        ('${approvalGroup}', 'Approval group', 'approval-group', 'approval'),
        ('${privateGroup}', 'Private group', 'private-group', 'private');

      insert into public.posts (id, author_id, visibility, media_ids, moderation_hidden) values
        ('${publicPost}', '${ownerProfile}', 'public', array['${publicMedia}'::uuid], false),
        ('${friendsPost}', '${ownerProfile}', 'friends', array['${friendsMedia}'::uuid], false),
        ('${privatePost}', '${ownerProfile}', 'private', array['${privateMedia}'::uuid], false),
        ('${hiddenPost}', '${ownerProfile}', 'public', array['${hiddenMedia}'::uuid], true);
      insert into public.media_assets (id, owner_id, provider, object_path, public_url, moderation_hidden) values
        ('${publicMedia}', '${owner}', 'supabase', '${publicPath}', '${publicUrl}', false),
        ('${friendsMedia}', '${owner}', 'supabase', '${friendsPath}', '${friendsUrl}', false),
        ('${privateMedia}', '${owner}', 'supabase', '${privatePath}', 'https://example.test/private', false),
        ('${hiddenMedia}', '${owner}', 'supabase', '${hiddenPath}', 'https://example.test/hidden', false),
        ('${malformedMedia}', '${owner}', 'supabase', '${malformedPath}', 'https://example.test/nested', false),
        ('${profileMedia}', '${owner}', 'supabase', '${profilePath}', '${profileUrl}', false);
      insert into storage.objects (bucket_id, name) values
        ('public-media', '${publicPath}'),
        ('public-media', '${friendsPath}'),
        ('public-media', '${privatePath}'),
        ('public-media', '${hiddenPath}'),
        ('public-media', '${malformedPath}'),
        ('public-media', '${profilePath}');
    `);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it('supports anonymous public browsing without exposing hidden columns before private-media hardening', async () => {
    expect(await visibleAnonymousPostIds()).toEqual([publicPost]);
    expect(await visibleAnonymousGroupHandles()).toEqual(['approval-group', 'public-group']);
    expect(await visibleAsset('anon', null, publicMedia)).toBe(true);
    expect(await visibleAsset('anon', null, friendsMedia)).toBe(false);
    await expect(asRole('anon', null, 'select owner_id from public.profiles'))
      .rejects.toThrow(/permission denied/i);
    await expect(asRole('anon', null, 'select moderation_hidden from public.posts'))
      .rejects.toThrow(/permission denied/i);

    const privateMediaMigration = await readFile(new URL('../supabase/migrations/017_private_media_access.sql', import.meta.url), 'utf8');
    await db.exec(privateMediaMigration);
  });

  it('executes the private-media migration and reports the database protections ready', async () => {
    const result = await asRole<{ hexispace_media_security_ready: boolean }>(
      'anon', null, 'select public.hexispace_media_security_ready()');
    expect(result.rows[0]?.hexispace_media_security_ready).toBe(true);
  });

  it('fails media readiness when another client-readable Storage policy could override visibility', async () => {
    for (const role of ['anon', 'authenticated', 'public'] as const) {
      const policy = `unexpected_${role}_storage_read`;
      await db.exec(`create policy ${policy} on storage.objects for all to ${role} using (true)`);
      const compromised = await asRole<{ hexispace_media_security_ready: boolean }>(
        'anon', null, 'select public.hexispace_media_security_ready()');
      expect(compromised.rows[0]?.hexispace_media_security_ready).toBe(false);
      await db.exec(`drop policy ${policy} on storage.objects`);
    }

    const restored = await asRole<{ hexispace_media_security_ready: boolean }>(
      'anon', null, 'select public.hexispace_media_security_ready()');
    expect(restored.rows[0]?.hexispace_media_security_ready).toBe(true);
  });

  it('removes anonymous bucket-wide access and allows only public media', async () => {
    expect(await visibleObject('anon', null, publicPath)).toBe(true);
    expect(await visibleObject('anon', null, friendsPath)).toBe(false);
    expect(await visibleObject('anon', null, privatePath)).toBe(false);
    expect(await visibleObject('anon', null, hiddenPath)).toBe(false);
    expect(await visibleObject('anon', null, malformedPath)).toBe(false);
    expect(await visibleObject('anon', null, profilePath)).toBe(false);
    expect(await visibleAsset('anon', null, publicMedia)).toBe(true);
    expect(await visibleAsset('anon', null, friendsMedia)).toBe(false);
    expect(await visibleAsset('anon', null, profileMedia)).toBe(false);
  });

  it('limits anonymous feed reads to public, non-hidden posts and safe columns after hardening', async () => {
    expect(await visibleAnonymousPostIds()).toEqual([publicPost]);
    await expect(asRole('anon', null, 'select owner_id from public.profiles'))
      .rejects.toThrow(/permission denied/i);
  });

  it('does not treat following as friendship for friends-only posts or media', async () => {
    expect(await visibleObject('authenticated', follower, publicPath)).toBe(true);
    expect(await visibleObject('authenticated', follower, friendsPath)).toBe(false);
    expect(await visibleObject('authenticated', follower, privatePath)).toBe(false);
    expect(await visibleObject('authenticated', follower, profilePath)).toBe(false);
    expect(await visibleAsset('authenticated', follower, friendsMedia)).toBe(false);
    expect(await visibleAsset('authenticated', follower, profileMedia)).toBe(false);
    expect(await visiblePostIds(follower)).toEqual([publicPost]);
  });

  it('grants friends-only content to accepted friends, but not private or hidden content', async () => {
    expect(await visibleObject('authenticated', friend, friendsPath)).toBe(true);
    expect(await visibleObject('authenticated', friend, privatePath)).toBe(false);
    expect(await visibleObject('authenticated', friend, profilePath)).toBe(true);
    expect(await visibleAsset('authenticated', friend, friendsMedia)).toBe(true);
    expect(await visibleAsset('authenticated', friend, profileMedia)).toBe(true);
    expect(await visibleObject('authenticated', friend, hiddenPath)).toBe(false);
    expect(await visiblePostIds(friend)).toEqual([publicPost, friendsPost]);
  });

  it('keeps the owner able to access their own private media and posts', async () => {
    expect(await visibleObject('authenticated', owner, privatePath)).toBe(true);
    expect(await visiblePostIds(owner)).toEqual([publicPost, friendsPost, privatePost, hiddenPost]);
  });

  it('denies access whether the author or the viewer created the block', async () => {
    await db.exec(`insert into public.blocks (owner_id, blocked_profile_id) values ('${owner}', '${followerProfile}')`);
    expect(await visibleObject('authenticated', follower, publicPath)).toBe(false);
    expect((await visiblePostIds(follower)).includes(publicPost)).toBe(false);

    await db.exec(`delete from public.blocks where owner_id = '${owner}' and blocked_profile_id = '${followerProfile}'`);
    await db.exec(`insert into public.blocks (owner_id, blocked_profile_id) values ('${follower}', '${ownerProfile}')`);
    expect(await visibleObject('authenticated', follower, publicPath)).toBe(false);
    expect((await visiblePostIds(follower)).includes(publicPost)).toBe(false);
  });

  it('rejects media paths that are not one canonical owner-scoped object name', async () => {
    expect(await visibleObject('authenticated', owner, malformedPath)).toBe(false);
  });
});
