import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let db: PGlite;

async function prepareSupabaseBase() {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create role supabase_auth_admin;
    create schema auth;
    create schema storage;
    create schema cron;

    create table auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz not null default now(),
      email_confirmed_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null
    );
    create function storage.foldername(object_name text) returns text[]
    language sql immutable as $$ select regexp_split_to_array(object_name, '/') $$;

    create table cron.scheduled_jobs (
      id bigint generated always as identity primary key,
      jobname text not null,
      schedule text not null,
      command text not null
    );
    create function cron.schedule(text, text, text) returns bigint
    language plpgsql as $$
    declare created_id bigint;
    begin
      insert into cron.scheduled_jobs(jobname, schedule, command)
      values ($1, $2, $3) returning id into created_id;
      return created_id;
    end
    $$;
    grant usage on schema auth, storage, cron, public to anon, authenticated, service_role, postgres;
    grant execute on function auth.uid() to anon, authenticated, service_role, postgres;
    grant execute on function storage.foldername(text) to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
}

async function asRole<T>(role: 'anon' | 'authenticated', userId: string | null, query: string, params: unknown[] = []) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.query(`set role ${role}`);
  try { return await db.query<T>(query, params); }
  finally { await db.query('reset role'); }
}

async function applyMigrationsInOrder() {
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));

  expect(names.map((name) => name.slice(0, 3))).toEqual(
    Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(3, '0'))
  );

  for (const name of names) {
    const original = await readFile(new URL(name, directory), 'utf8');
    let migration = original;
    if (name.startsWith('001_')) {
      migration = migration.replace(/^create extension if not exists pgcrypto;\s*$/m,
        '-- PGlite provides gen_random_uuid() in pg_catalog; extension installation is platform setup.');
      expect(migration).not.toBe(original);
    }
    if (name.startsWith('018_')) {
      migration = migration.replace(/^create extension if not exists pg_cron with schema pg_catalog;\s*$/m,
        '-- pg_cron is represented by the test-only scheduler below.');
      expect(migration).not.toBe(original);
    }

    try {
      await db.exec(migration);
    } catch (error) {
      throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}

describe('complete Supabase migration chain', () => {
  beforeAll(async () => {
    db = new PGlite();
    await prepareSupabaseBase();
    await applyMigrationsInOrder();
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('applies every numbered migration in order on a clean Supabase-shaped schema', async () => {
    const result = await db.query<{ table_count: number; policy_count: number }>(`
      select
        (select count(*)::int from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as table_count,
        (select count(*)::int from pg_catalog.pg_policies where schemaname in ('public', 'storage')) as policy_count
    `);
    expect(result.rows[0]?.table_count).toBeGreaterThanOrEqual(25);
    expect(result.rows[0]?.policy_count).toBeGreaterThanOrEqual(30);
  });

  it('ends with private media and signup protections plus scheduled cleanup jobs', async () => {
    const ready = await db.query<{ ready: boolean }>('select public.hexispace_media_security_ready() as ready');
    expect(ready.rows[0]?.ready).toBe(true);

    const bucket = await db.query<{ public: boolean }>(
      "select public from storage.buckets where id = 'public-media'");
    expect(bucket.rows[0]?.public).toBe(false);

    const jobs = await db.query<{ jobname: string }>('select jobname from cron.scheduled_jobs');
    expect(jobs.rows).toEqual([
      { jobname: 'hexicoin-referral-maintenance' },
      { jobname: 'hexicoin-signup-guard-cleanup' }
    ]);

    const referrals = await db.query<{ exists: boolean }>(`
      select to_regclass('public.hexicoin_referral_codes') is not null as exists
    `);
    expect(referrals.rows[0]?.exists).toBe(true);

    const hook = await db.query<{ auth_can_execute: boolean; anon_can_execute: boolean }>(`
      select
        has_function_privilege('supabase_auth_admin', 'public.hexispace_before_user_created(jsonb)', 'EXECUTE') as auth_can_execute,
        has_function_privilege('anon', 'public.hexispace_before_user_created(jsonb)', 'EXECUTE') as anon_can_execute
    `);
    expect(hook.rows[0]).toEqual({ auth_can_execute: true, anon_can_execute: false });
  });

  it('keeps profile ownership and Hexonaut inbox addresses private while preserving owner workflows', async () => {
    const owner = '00000000-0000-4000-8000-000000000071';
    const stranger = '00000000-0000-4000-8000-000000000072';
    const ownProfile = '10000000-0000-4000-8000-000000000071';
    const strangerProfile = '10000000-0000-4000-8000-000000000072';
    const ownHexonaut = '10000000-0000-4000-8000-000000000073';
    const privateHexonaut = '10000000-0000-4000-8000-000000000074';
    await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()), ($3, $4, now())',
      [owner, 'owner@example.test', stranger, 'stranger@example.test']);
    await db.query(`insert into public.profiles (id, owner_id, kind, display_name, handle, visibility, inbox_address)
      values ($1, $2, 'human', 'Owner', 'owner_profile', 'public', null),
             ($3, $4, 'hexonaut', 'Stranger', 'stranger_agent', 'public', 'stranger_agent@inbox.hexispace.local'),
             ($5, $4, 'hexonaut', 'Private Agent', 'private_agent', 'private', 'private_agent@inbox.hexispace.local')`,
      [ownProfile, owner, strangerProfile, stranger, privateHexonaut]);

    await asRole('authenticated', owner,
      `insert into public.profiles (owner_id, kind, display_name, handle, visibility)
       values ($1, 'hexonaut', 'Owner Agent', 'owner_agent', 'private')`, [owner]);
    const ownAgent = await asRole<{ id: string; inbox_address: string }>('authenticated', owner,
      'select id, inbox_address from public.my_profiles() where handle = $1', ['owner_agent']);
    expect(ownAgent.rows).toHaveLength(1);
    expect(ownAgent.rows[0]?.inbox_address).toBe('owner_agent@inbox.hexispace.local');
    expect(ownAgent.rows[0]?.id).toBeTruthy();
    await expect(asRole('authenticated', owner,
      `insert into public.profiles (owner_id, kind, display_name, handle, visibility, inbox_address)
       values ($1, 'hexonaut', 'Spoofed Agent', 'spoofed_agent', 'public', 'stranger@inbox.hexispace.local')`,
      [owner])).rejects.toThrow(/permission denied/i);

    const visible = await asRole<{ id: string; display_name: string }>('authenticated', owner,
      'select id, display_name from public.profiles where id = $1', [strangerProfile]);
    expect(visible.rows[0]).toEqual({ id: strangerProfile, display_name: 'Stranger' });
    await expect(asRole('authenticated', owner, 'select owner_id from public.profiles where id = $1', [strangerProfile]))
      .rejects.toThrow(/permission denied/i);
    await expect(asRole('authenticated', owner, 'select inbox_address from public.profiles where id = $1', [strangerProfile]))
      .rejects.toThrow(/permission denied/i);

    const mine = await asRole<Record<string, unknown>>('authenticated', owner, 'select * from public.my_profiles()');
    expect(mine.rows).toHaveLength(2);
    expect(mine.rows.map((profile) => profile.id)).toContain(ownProfile);
    expect(mine.rows.find((profile) => profile.id === ownAgent.rows[0]?.id)?.inbox_address)
      .toBe('owner_agent@inbox.hexispace.local');
    expect(mine.rows).not.toContainEqual(expect.objectContaining({ id: privateHexonaut }));
    expect(mine.rows[0]).not.toHaveProperty('owner_id');

    const resolved = await asRole<{ profile_id: string }>('authenticated', owner,
      "select profile_id from public.resolve_hexonaut_inbox('stranger_agent@inbox.hexispace.local')");
    expect(resolved.rows).toEqual([{ profile_id: strangerProfile }]);
    const hiddenAddress = await asRole<{ profile_id: string }>('authenticated', owner,
      "select profile_id from public.resolve_hexonaut_inbox('private_agent@inbox.hexispace.local')");
    expect(hiddenAddress.rows).toEqual([]);

    const createdFollow = await asRole<{ follower_id: string }>('authenticated', owner,
      'insert into public.follows (follower_id, following_id) values ($1, $2) returning follower_id',
      [ownProfile, strangerProfile]);
    expect(createdFollow.rows).toEqual([{ follower_id: ownProfile }]);

    const createdPost = await asRole<{ id: string }>('authenticated', owner,
      "insert into public.posts (author_id, body, visibility) values ($1, 'A private note', 'private') returning id",
      [ownProfile]);
    const ownPost = createdPost.rows[0]?.id;
    expect(ownPost).toBeTruthy();
    const visibleOwnPost = await asRole<{ id: string }>('authenticated', owner,
      'select id from public.posts where id = $1', [ownPost]);
    expect(visibleOwnPost.rows).toHaveLength(1);
    const hiddenOwnPost = await asRole<{ id: string }>('authenticated', stranger,
      'select id from public.posts where id = $1', [ownPost]);
    expect(hiddenOwnPost.rows).toEqual([]);

    const sentMail = await asRole<{ id: string }>('authenticated', owner,
      `insert into public.hexonaut_mail (recipient_profile_id, sender_profile_id, subject, body)
       values ($1, $2, 'Hello', 'A message') returning id`, [strangerProfile, ownProfile]);
    expect(sentMail.rows).toHaveLength(1);

    const update = await asRole<{ display_name: string }>('authenticated', owner,
      'update public.profiles set display_name = $1 where id = $2 returning display_name', ['Owner Updated', ownProfile]);
    expect(update.rows[0]?.display_name).toBe('Owner Updated');
    await expect(asRole('authenticated', owner,
      'update public.profiles set owner_id = $1 where id = $2', [stranger, ownProfile]))
      .rejects.toThrow(/permission denied/i);

    const helperProbe = await asRole<{ owns_stranger: boolean }>('authenticated', owner,
      'select private.is_my_profile($1) as owns_stranger', [strangerProfile]);
    expect(helperProbe.rows).toEqual([{ owns_stranger: false }]);
    await expect(asRole('anon', null,
      'select private.is_my_profile($1)', [strangerProfile])).rejects.toThrow(/permission denied/i);
  });

  it('does not leave client RLS policies recursively reading profile ownership', async () => {
    const result = await db.query<{ tablename: string; policyname: string; expression: string }>(`
      select tablename, policyname,
        coalesce(qual, '') || ' ' || coalesce(with_check, '') as expression
      from pg_catalog.pg_policies
      where schemaname = 'public'
    `);
    const directOwnershipLookups = result.rows.filter(({ expression }) =>
      /\b(from|join)\s+public\.profiles\b/i.test(expression) && /\bowner_id\b/i.test(expression)
    );
    expect(directOwnershipLookups).toEqual([]);
  });

  it('runs the existing-project preflight without reading user rows or changing database state', async () => {
    const sql = await readFile(new URL('../public/hexispace-production-preflight.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/\b(insert|update|delete|alter|create|drop|grant|revoke)\s+/i);
    expect(sql).not.toMatch(/\bfrom\s+public\.(profiles|posts|messages)\b/i);

    const result = await db.query<{ hexispace_existing_project_preflight: string }>(sql);
    const report = JSON.parse(result.rows[0]?.hexispace_existing_project_preflight || '{}');
    expect(report.core_tables.profiles).toBe(true);
    expect(report.public_profile_grants.anonymous_can_read_handle).toBe(true);
    expect(report.public_profile_grants.anonymous_can_read_private_owner_id).toBe(false);
    expect(report.public_profile_grants.authenticated_can_read_private_owner_id).toBe(false);
    expect(report.public_profile_grants.authenticated_can_read_private_inbox_address).toBe(false);
    expect(report.public_profile_grants.authenticated_can_read_safe_owner_rpc).toBe(true);
    expect(report.public_profile_grants.ownership_policy_helper_exists).toBe(true);
    expect(report.public_profile_grants.anonymous_has_table_wide_select).toBe(false);
    expect(report.media_protection.public_media_bucket_is_private).toBe(true);
    expect(report.media_protection.readiness_check_exists).toBe(true);
  });
});
