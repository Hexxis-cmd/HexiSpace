import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const referrer = '00000000-0000-4000-8000-000000000001';
const invitee = '00000000-0000-4000-8000-000000000002';
const recipient = '00000000-0000-4000-8000-000000000003';
const expiredAccount = '00000000-0000-4000-8000-000000000004';
const deleteAccount = '00000000-0000-4000-8000-000000000005';
const reviewAccount = '00000000-0000-4000-8000-000000000006';
const cappedInvitee = '00000000-0000-4000-8000-000000000007';
const dailyCapReferrer = '00000000-0000-4000-8000-000000000008';
const dailyCapInvitee = '00000000-0000-4000-8000-000000000009';
const monthlyCapReferrer = '00000000-0000-4000-8000-000000000010';
const monthlyCapInvitee = '00000000-0000-4000-8000-000000000011';
const lifetimeCapReferrer = '00000000-0000-4000-8000-000000000012';
const lifetimeCapInvitee = '00000000-0000-4000-8000-000000000013';
const referrerProfile = '10000000-0000-4000-8000-000000000001';
const inviteeProfile = '10000000-0000-4000-8000-000000000002';
const recipientProfile = '10000000-0000-4000-8000-000000000003';
const expiredProfile = '10000000-0000-4000-8000-000000000004';
const deleteProfile = '10000000-0000-4000-8000-000000000005';
const reviewProfile = '10000000-0000-4000-8000-000000000006';
const dailyCapReferrerProfile = '10000000-0000-4000-8000-000000000008';
const dailyCapInviteeProfile = '10000000-0000-4000-8000-000000000009';
const monthlyCapReferrerProfile = '10000000-0000-4000-8000-000000000010';
const monthlyCapInviteeProfile = '10000000-0000-4000-8000-000000000011';
const lifetimeCapReferrerProfile = '10000000-0000-4000-8000-000000000012';
const lifetimeCapInviteeProfile = '10000000-0000-4000-8000-000000000013';
const requestKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ipDigest = '1'.repeat(64);
const deviceDigest = '2'.repeat(64);

let db: PGlite;

type TestRole = 'anon' | 'authenticated' | 'service_role';

async function asRole<T>(role: TestRole, userId: string | null, query: string, params: unknown[] = []) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.query(`set role ${role}`);
  try {
    return await db.query<T>(query, params);
  } finally {
    await db.query('reset role');
  }
}

async function walletBalance(ownerId: string) {
  const result = await asRole<{ balance: number }>('authenticated', ownerId,
    'select balance from public.hexicoin_wallets where owner_id = $1', [ownerId]);
  return result.rows[0]?.balance;
}

async function referralStatus(ownerId: string, code: string, ip = ipDigest, device = deviceDigest) {
  const result = await asRole<{ result: { status: string } }>('service_role', null,
    'select public.submit_hexicoin_referral($1, $2, $3, $4) as result', [ownerId, code, ip, device]);
  return result.rows[0]?.result.status;
}

describe('HexiCoin database ledger, referrals, and gift spending', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create schema private;
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
      grant usage on schema auth, private, public, cron to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;

      create table public.profiles (
        id uuid primary key,
        owner_id uuid not null references auth.users(id) on delete cascade,
        display_name text not null,
        handle text not null unique,
        visibility text not null default 'public',
        created_at timestamptz not null default now(),
        moderation_hidden boolean not null default false
      );
      create table public.friendships (requester_id uuid, addressee_id uuid, accepted boolean not null default false);
      create table public.blocks (owner_id uuid, blocked_profile_id uuid);
      create table public.follows (follower_id uuid not null, following_id uuid not null, primary key (follower_id, following_id));
      create table public.posts (
        id uuid primary key,
        author_id uuid not null,
        visibility text not null,
        body text not null,
        moderation_hidden boolean not null default false,
        created_at timestamptz not null default now()
      );
      create table public.comments (
        id uuid primary key,
        author_id uuid not null,
        post_id uuid not null,
        body text not null,
        moderation_hidden boolean not null default false,
        created_at timestamptz not null default now()
      );
      create table public.reactions (id uuid primary key, profile_id uuid not null, post_id uuid not null);
      create table public.groups (id uuid primary key, owner_id uuid not null, visibility text not null);
      create table public.group_members (group_id uuid not null, profile_id uuid not null, status text not null);
      create table public.notifications (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid not null,
        kind text not null,
        title text not null,
        body text not null default '',
        created_at timestamptz not null default now()
      );
      create table public.platform_admins (user_id uuid primary key);
      create table public.hexicoin_wallets (
        owner_id uuid primary key references auth.users(id) on delete cascade,
        balance integer not null default 0 check (balance >= 0),
        created_at timestamptz not null default now()
      );
      create table public.hexicoin_ledger (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid not null constraint hexicoin_ledger_owner_id_fkey references auth.users(id) on delete cascade,
        delta integer not null check (delta <> 0),
        reason text not null,
        created_at timestamptz not null default now()
      );
      create table public.gift_catalog (
        id uuid primary key default gen_random_uuid(),
        gift_key text not null unique,
        name text not null,
        description text not null default '',
        cost integer not null check (cost between 1 and 10000),
        icon text not null,
        enabled boolean not null default true
      );
      create table public.gift_sends (
        id uuid primary key default gen_random_uuid(),
        sender_profile_id uuid not null references public.profiles(id) on delete cascade,
        recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
        gift_id uuid not null references public.gift_catalog(id),
        quantity integer not null check (quantity between 1 and 20),
        note text not null default '',
        created_at timestamptz not null default now(),
        check (sender_profile_id <> recipient_profile_id)
      );
      alter table public.profiles enable row level security;
      alter table public.posts enable row level security;
      alter table public.comments enable row level security;
      grant select on public.profiles to authenticated;
      grant select, insert on public.posts, public.follows to authenticated;
      create policy test_posts_insert on public.posts for insert to authenticated
        with check (author_id in (select id from public.profiles where owner_id = auth.uid()));
      create policy test_follows_insert on public.follows for insert to authenticated
        with check (follower_id in (select id from public.profiles where owner_id = auth.uid()));

      create table cron.scheduled_jobs (
        id bigint generated always as identity primary key,
        jobname text not null,
        schedule text not null,
        command text not null
      );
      create function cron.schedule(text, text, text) returns bigint
      language plpgsql as $$ declare created_id bigint; begin
        insert into cron.scheduled_jobs(jobname, schedule, command) values ($1, $2, $3) returning id into created_id;
        return created_id;
      end $$;

      create function public.send_hexicoin_gift(uuid, uuid, text, integer, text)
      returns public.gift_sends language sql as $$ select null::public.gift_sends $$;
    `);

    const safetyHelpers = await readFile(new URL('../supabase/migrations/006_profile_safety.sql', import.meta.url), 'utf8');
    await db.exec(safetyHelpers);
    const rawMigration = await readFile(new URL('../supabase/migrations/018_hexicoin_integrity_and_referrals.sql', import.meta.url), 'utf8');
    const migration = rawMigration.replace(
      'create extension if not exists pg_cron with schema pg_catalog;',
      '-- pg_cron is represented by a test-only scheduler table and function.'
    );
    if (migration === rawMigration) throw new Error('The expected pg_cron statement was not found.');
    await db.exec(migration);

    await db.query(`insert into auth.users (id, email, email_confirmed_at) values
      ($1, 'referrer@example.test', now()),
      ($2, 'invitee@example.test', now()),
      ($3, 'recipient@example.test', now()),
      ($4, 'expired@example.test', now()),
      ($5, 'delete@example.test', now()),
      ($6, 'review@example.test', now()),
      ($7, 'daily-cap-referrer@example.test', now()),
      ($8, 'daily-cap-invitee@example.test', now()),
      ($9, 'monthly-cap-referrer@example.test', now()),
      ($10, 'monthly-cap-invitee@example.test', now()),
      ($11, 'lifetime-cap-referrer@example.test', now()),
      ($12, 'lifetime-cap-invitee@example.test', now())`,
      [referrer, invitee, recipient, expiredAccount, deleteAccount, reviewAccount, dailyCapReferrer, dailyCapInvitee, monthlyCapReferrer, monthlyCapInvitee, lifetimeCapReferrer, lifetimeCapInvitee]);
    await db.query("update auth.users set created_at = now() - interval '73 hours' where id = $1", [expiredAccount]);
    await db.query(`insert into public.profiles (id, owner_id, display_name, handle, visibility) values
      ($1, $2, 'Referrer', 'referrer', 'public'),
      ($3, $4, 'Invitee', 'invitee', 'public'),
      ($5, $6, 'Recipient', 'recipient', 'public'),
      ($7, $8, 'Expired', 'expired', 'public'),
      ($9, $10, 'Delete account', 'deleteaccount', 'public'),
      ($11, $12, 'Review user', 'reviewuser', 'public'),
      ($13, $14, 'Daily cap referrer', 'dailycapreferrer', 'public'),
      ($15, $16, 'Daily cap invitee', 'dailycapinvitee', 'public'),
      ($17, $18, 'Monthly cap referrer', 'monthlycapreferrer', 'public'),
      ($19, $20, 'Monthly cap invitee', 'monthlycapinvitee', 'public'),
      ($21, $22, 'Lifetime cap referrer', 'lifetimecapreferrer', 'public'),
      ($23, $24, 'Lifetime cap invitee', 'lifetimecapinvitee', 'public')`,
      [referrerProfile, referrer, inviteeProfile, invitee, recipientProfile, recipient, expiredProfile, expiredAccount, deleteProfile, deleteAccount, reviewProfile, reviewAccount, dailyCapReferrerProfile, dailyCapReferrer, dailyCapInviteeProfile, dailyCapInvitee, monthlyCapReferrerProfile, monthlyCapReferrer, monthlyCapInviteeProfile, monthlyCapInvitee, lifetimeCapReferrerProfile, lifetimeCapReferrer, lifetimeCapInviteeProfile, lifetimeCapInvitee]);
    await db.query('insert into public.platform_admins (user_id) values ($1)', [recipient]);
    await db.query(`insert into public.gift_catalog (gift_key, name, description, cost, icon, enabled)
      values ('signal', 'Signal', 'A small thank-you', 5, '✦', true)`);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it('creates exactly one auditable 1,000-coin starter balance per auth account', async () => {
    expect(await walletBalance(referrer)).toBe(1000);
    expect(await walletBalance(invitee)).toBe(1000);
    const ledger = await db.query<{ count: number }>(`select count(*)::int as count from public.hexicoin_ledger
      where entry_type = 'signup_bonus' and delta = 1000`);
    expect(ledger.rows[0]?.count).toBe(12);
    const codes = await db.query<{ count: number }>('select count(*)::int as count from public.hexicoin_referral_codes');
    expect(codes.rows[0]?.count).toBe(12);
    const schedule = await db.query<{ jobname: string; command: string }>('select jobname, command from cron.scheduled_jobs');
    expect(schedule.rows).toEqual([{
      jobname: 'hexicoin-referral-maintenance',
      command: 'select private.process_pending_hexicoin_referrals()'
    }]);
  });

  it('rejects self-referrals, expired redemption windows, and second redemptions', async () => {
    const ownCode = await db.query<{ code: string }>('select code from public.hexicoin_referral_codes where owner_id = $1', [referrer]);
    expect(await referralStatus(referrer, ownCode.rows[0]!.code, '8'.repeat(64), '9'.repeat(64))).toBe('self_referral');
    expect(await referralStatus(expiredAccount, ownCode.rows[0]!.code, '3'.repeat(64), '4'.repeat(64))).toBe('window_closed');
    expect(await referralStatus(invitee, ownCode.rows[0]!.code)).toBe('pending');

    const recipientCode = await db.query<{ code: string }>('select code from public.hexicoin_referral_codes where owner_id = $1', [recipient]);
    expect(await referralStatus(invitee, recipientCode.rows[0]!.code)).toBe('already_redeemed');
  });

  it('settles referral rewards only after verified profiles and two categories at least a day apart', async () => {
    const claim = await db.query<{ id: string; status: string }>(
      'select id, status from private.hexicoin_referral_claims where referred_owner = $1', [invitee]);
    expect(claim.rows[0]?.status).toBe('pending');

    await asRole('authenticated', invitee, `insert into public.posts (id, author_id, visibility, body)
      values ('30000000-0000-4000-8000-000000000001', $1, 'public', 'A substantial post that represents a real social action for this account.')`, [inviteeProfile]);
    await db.query(`update private.hexicoin_referral_activity set observed_at = now() - interval '25 hours',
      latest_observed_at = now() - interval '25 hours' where claim_id = $1 and category = 'post'`, [claim.rows[0]!.id]);
    expect(await walletBalance(invitee)).toBe(1000);

    await asRole('authenticated', invitee, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [inviteeProfile, referrerProfile]);
    expect(await walletBalance(invitee)).toBe(1500);
    expect(await walletBalance(referrer)).toBe(1500);

    const entries = await db.query<{ entry_type: string; delta: number }>(`select entry_type, delta from public.hexicoin_ledger
      where entry_type in ('referral_new_user', 'referral_referrer') order by entry_type`);
    expect(entries.rows).toEqual([
      { entry_type: 'referral_new_user', delta: 500 },
      { entry_type: 'referral_referrer', delta: 500 }
    ]);
    const status = await asRole<{ claim_status: string }>('authenticated', invitee,
      'select claim_status from public.my_hexicoin_referral_status()');
    expect(status.rows[0]?.claim_status).toBe('credited');
    expect(await referralStatus(invitee, (await db.query<{ code: string }>(
      'select code from public.hexicoin_referral_codes where owner_id = $1', [referrer])).rows[0]!.code)).toBe('credited');
  });

  it('holds shared-IP referrals for owner review and requires an authorized decision', async () => {
    const code = await db.query<{ code: string }>('select code from public.hexicoin_referral_codes where owner_id = $1', [referrer]);
    expect(await referralStatus(reviewAccount, code.rows[0]!.code, ipDigest, '5'.repeat(64))).toBe('review');
    const claim = await db.query<{ id: string; status: string }>(
      'select id, status from private.hexicoin_referral_claims where referred_owner = $1', [reviewAccount]);
    expect(claim.rows[0]?.status).toBe('review');

    await asRole('authenticated', reviewAccount, `insert into public.posts (id, author_id, visibility, body)
      values ('30000000-0000-4000-8000-000000000006', $1, 'public', 'A second substantial post representing a real social action.')`, [reviewProfile]);
    await db.query(`update private.hexicoin_referral_activity set observed_at = now() - interval '25 hours',
      latest_observed_at = now() - interval '25 hours' where claim_id = $1 and category = 'post'`, [claim.rows[0]!.id]);
    await asRole('authenticated', reviewAccount,
      'insert into public.follows(follower_id, following_id) values ($1, $2)', [reviewProfile, referrerProfile]);
    expect(await walletBalance(reviewAccount)).toBe(1000);

    await expect(asRole('authenticated', invitee,
      'select * from public.admin_list_hexicoin_referral_reviews()'))
      .rejects.toThrow(/not authorized/i);
    const reviews = await asRole<{ claim_id: string; risk_flags: string[] }>('authenticated', recipient,
      'select claim_id, risk_flags from public.admin_list_hexicoin_referral_reviews()');
    expect(reviews.rows.some((row) => row.claim_id === claim.rows[0]!.id && row.risk_flags.includes('shared_ip'))).toBe(true);

    const decision = await asRole<{ status: string }>('authenticated', recipient,
      "select public.admin_decide_hexicoin_referral($1, 'approve', 'Reviewed shared-IP signal') as status", [claim.rows[0]!.id]);
    expect(decision.rows[0]?.status).toBe('credited');
    expect(await walletBalance(reviewAccount)).toBe(1500);
  });

  it('holds referrals sharing a browser-install signal for review without crediting either account', async () => {
    const sharedDeviceReferrer = '00000000-0000-4000-8000-000000000014';
    const firstInvitee = '00000000-0000-4000-8000-000000000015';
    const secondInvitee = '00000000-0000-4000-8000-000000000016';
    const profileIds = [
      '10000000-0000-4000-8000-000000000014',
      '10000000-0000-4000-8000-000000000015',
      '10000000-0000-4000-8000-000000000016'
    ];
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values
      ($1, 'device-referrer@example.test', now()),
      ($2, 'device-first@example.test', now()),
      ($3, 'device-second@example.test', now())`, [sharedDeviceReferrer, firstInvitee, secondInvitee]);
    await db.query(`insert into public.profiles (id, owner_id, display_name, handle, visibility) values
      ($1, $2, 'Device referrer', 'devicereferrer', 'public'),
      ($3, $4, 'First device invitee', 'firstdeviceinvitee', 'public'),
      ($5, $6, 'Second device invitee', 'seconddeviceinvitee', 'public')`,
      [profileIds[0], sharedDeviceReferrer, profileIds[1], firstInvitee, profileIds[2], secondInvitee]);
    const code = await db.query<{ code: string }>(
      'select code from public.hexicoin_referral_codes where owner_id = $1', [sharedDeviceReferrer]);

    expect(await referralStatus(firstInvitee, code.rows[0]!.code, '7'.repeat(64), '8'.repeat(64))).toBe('pending');
    expect(await referralStatus(secondInvitee, code.rows[0]!.code, '9'.repeat(64), '8'.repeat(64))).toBe('review');
    expect(await walletBalance(firstInvitee)).toBe(1000);
    expect(await walletBalance(secondInvitee)).toBe(1000);
    const reviewedClaim = await db.query<{ risk_flags: string[] }>(
      'select risk_flags from private.hexicoin_referral_claims where referred_owner = $1', [secondInvitee]);
    expect(reviewedClaim.rows[0]?.risk_flags).toContain('shared_device');
  });

  it('allows exactly ten lifetime referrals and blocks the eleventh', async () => {
    await db.query(`insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key, created_at)
      select $1, 500, 'successful_referral_bonus', 'referral_referrer', 'test-referrer-cap:' || n::text, now() - interval '31 days'
      from generate_series(1, 9) n`, [lifetimeCapReferrer]);
    await db.query('update public.hexicoin_wallets set balance = 5500 where owner_id = $1', [lifetimeCapReferrer]);
    const code = await db.query<{ code: string }>('select code from public.hexicoin_referral_codes where owner_id = $1', [lifetimeCapReferrer]);
    expect(await referralStatus(lifetimeCapInvitee, code.rows[0]!.code, 'e'.repeat(64), 'f'.repeat(64))).toBe('pending');
    const claim = await db.query<{ id: string }>(
      'select id from private.hexicoin_referral_claims where referred_owner = $1', [lifetimeCapInvitee]);
    await asRole('authenticated', lifetimeCapInvitee, `insert into public.posts (id, author_id, visibility, body)
      values ('30000000-0000-4000-8000-000000000010', $1, 'public', 'A substantial post demonstrating an authentic account action for referral review.')`, [lifetimeCapInviteeProfile]);
    await db.query(`update private.hexicoin_referral_activity set observed_at = now() - interval '25 hours',
      latest_observed_at = now() - interval '25 hours' where claim_id = $1 and category = 'post'`, [claim.rows[0]!.id]);
    await asRole('authenticated', lifetimeCapInvitee,
      'insert into public.follows(follower_id, following_id) values ($1, $2)', [lifetimeCapInviteeProfile, lifetimeCapReferrerProfile]);
    expect(await walletBalance(lifetimeCapInvitee)).toBe(1500);
    expect(await walletBalance(lifetimeCapReferrer)).toBe(6000);

    await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [cappedInvitee, 'cap@example.test']);
    expect(await referralStatus(cappedInvitee, code.rows[0]!.code, '1'.repeat(64), '3'.repeat(64))).toBe('referrer_cap');
    expect(await walletBalance(cappedInvitee)).toBe(1000);
  });

  it('holds otherwise-qualified referrals at the rolling daily and monthly issuance caps', async () => {
    const prepareCappedReferral = async (ownerId: string, profileId: string, referrerId: string, code: string, postId: string, ip: string, device: string) => {
      expect(await referralStatus(ownerId, code, ip, device)).toBe('pending');
      const claim = await db.query<{ id: string }>(
        'select id from private.hexicoin_referral_claims where referred_owner = $1', [ownerId]);
      await asRole('authenticated', ownerId, `insert into public.posts (id, author_id, visibility, body)
        values ($1, $2, 'public', 'A substantial post demonstrating an authentic account action for referral review.')`, [postId, profileId]);
      await db.query(`update private.hexicoin_referral_activity set observed_at = now() - interval '25 hours',
        latest_observed_at = now() - interval '25 hours' where claim_id = $1 and category = 'post'`, [claim.rows[0]!.id]);
      await asRole('authenticated', ownerId,
        'insert into public.follows(follower_id, following_id) values ($1, $2)', [profileId, referrerId]);
      return claim.rows[0]!.id;
    };

    const dailyCode = await db.query<{ code: string }>(
      'select code from public.hexicoin_referral_codes where owner_id = $1', [dailyCapReferrer]);
    await db.query(`insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key, created_at)
      values ($1, 500, 'successful_referral_bonus', 'referral_referrer', 'test-daily-cap:1', now() - interval '1 hour'),
             ($1, 500, 'successful_referral_bonus', 'referral_referrer', 'test-daily-cap:2', now() - interval '2 hours')`, [dailyCapReferrer]);
    await db.query('update public.hexicoin_wallets set balance = 2000 where owner_id = $1', [dailyCapReferrer]);
    const dailyClaim = await prepareCappedReferral(dailyCapInvitee, dailyCapInviteeProfile, dailyCapReferrerProfile,
      dailyCode.rows[0]!.code, '30000000-0000-4000-8000-000000000008', 'c'.repeat(64), 'd'.repeat(64));
    expect(await walletBalance(dailyCapInvitee)).toBe(1000);
    expect((await db.query<{ status: string }>(
      'select status from private.hexicoin_referral_claims where id = $1', [dailyClaim])).rows[0]?.status).toBe('pending');

    const monthlyCode = await db.query<{ code: string }>(
      'select code from public.hexicoin_referral_codes where owner_id = $1', [monthlyCapReferrer]);
    await db.query(`insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key, created_at)
      select $1, 500, 'successful_referral_bonus', 'referral_referrer', 'test-monthly-cap:' || n::text, now() - interval '2 days'
      from generate_series(1, 5) n`, [monthlyCapReferrer]);
    await db.query('update public.hexicoin_wallets set balance = 3500 where owner_id = $1', [monthlyCapReferrer]);
    const monthlyClaim = await prepareCappedReferral(monthlyCapInvitee, monthlyCapInviteeProfile, monthlyCapReferrerProfile,
      monthlyCode.rows[0]!.code, '30000000-0000-4000-8000-000000000009', 'a'.repeat(64), 'b'.repeat(64));
    expect(await walletBalance(monthlyCapInvitee)).toBe(1000);
    expect((await db.query<{ status: string }>(
      'select status from private.hexicoin_referral_claims where id = $1', [monthlyClaim])).rows[0]?.status).toBe('pending');
  });

  it('spends gifts atomically and returns the original receipt for an identical retry', async () => {
    const send = () => asRole<{ id: string }>('authenticated', referrer,
      'select (public.send_hexicoin_gift($1, $2, $3, $4, $5, $6)).id as id',
      [referrerProfile, recipientProfile, 'signal', 2, 'Thanks for the help', requestKey]);
    const first = await send();
    const retry = await send();
    expect(first.rows[0]?.id).toBeTruthy();
    expect(retry.rows[0]?.id).toBe(first.rows[0]?.id);
    expect(await walletBalance(referrer)).toBe(1990);
    expect(await walletBalance(recipient)).toBe(1000);

    await expect(asRole('authenticated', referrer,
      'select public.send_hexicoin_gift($1, $2, $3, $4, $5, $6)',
      [referrerProfile, recipientProfile, 'signal', 1, 'Different request', requestKey]))
      .rejects.toThrow(/request key was already used/i);
    expect(await walletBalance(referrer)).toBe(1990);

    await expect(asRole('authenticated', invitee,
      'select public.send_hexicoin_gift($1, $2, $3, $4, $5, $6)',
      [referrerProfile, recipientProfile, 'signal', 1, '', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']))
      .rejects.toThrow(/sender profile is not owned/i);
  });

  it('blocks direct coin writes and rejects ledger edits even at the database layer', async () => {
    await expect(asRole('authenticated', invitee,
      'update public.hexicoin_wallets set balance = balance + 1 where owner_id = $1', [invitee]))
      .rejects.toThrow(/permission denied/i);
    await expect(asRole('service_role', null,
      "insert into public.hexicoin_ledger(owner_id, delta, reason) values ($1, 1, 'forged')", [invitee]))
      .rejects.toThrow(/permission denied/i);
    await expect(asRole('service_role', null,
      'update public.hexicoin_wallets set balance = balance + 500 where owner_id = $1', [invitee]))
      .rejects.toThrow(/permission denied/i);
    await expect(asRole('authenticated', invitee,
      'select public.submit_hexicoin_referral($1, $2, $3, $4)', [invitee, '0'.repeat(16), ipDigest, deviceDigest]))
      .rejects.toThrow(/permission denied/i);
    await expect(db.query("update public.hexicoin_ledger set delta = 999 where reason = 'gift:signal'"))
      .rejects.toThrow(/append-only/i);
  });

  it('keeps the ledger row but removes the deleted account identifier', async () => {
    const before = await db.query<{ id: string }>(
      "select id from public.hexicoin_ledger where owner_id = $1 and entry_type = 'signup_bonus'", [deleteAccount]);
    expect(before.rows).toHaveLength(1);
    await db.query('delete from auth.users where id = $1', [deleteAccount]);
    const after = await db.query<{ owner_id: string }>('select owner_id from public.hexicoin_ledger where id = $1', [before.rows[0]!.id]);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]?.owner_id).not.toBe(deleteAccount);
  });
});
