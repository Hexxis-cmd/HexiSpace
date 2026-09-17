import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const migrationDir = resolve(root, 'supabase/migrations');
const migrationFiles = readdirSync(migrationDir).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
const allMigrations = migrationFiles.map((file) => readFileSync(resolve(migrationDir, file), 'utf8')).join('\n');
const migrations = migrationFiles.slice(0, 3).map((file) => readFileSync(resolve(migrationDir, file), 'utf8')).join('\n');

describe('HexiVerse data boundary', () => {
  it('enables RLS for every user-data table', () => {
    for (const table of ['profiles', 'ownership_links', 'posts', 'media_assets', 'rooms', 'room_members', 'messages', 'encrypted_room_keys', 'agent_grants', 'connector_links', 'audit_receipts', 'reports', 'blocks', 'comments', 'reactions', 'notifications', 'scheduled_tasks', 'profile_device_keys', 'hexonaut_mail', 'mailbox_connections']) {
      expect(allMigrations).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('gives Hexonaut inboxes an owner-scoped mail boundary', () => {
    expect(allMigrations).toContain('profiles_inbox_address_idx');
    expect(allMigrations).toContain('hexonaut_mail_sender_insert');
    expect(allMigrations).toContain('recipient_profile_id in (select id from public.profiles where owner_id = auth.uid())');
  });

  it('keeps external mailbox tokens out of the social schema', () => {
    expect(allMigrations).toContain('mailbox_connections');
    expect(allMigrations).not.toContain('access_token');
    expect(allMigrations).not.toContain('refresh_token');
    expect(allMigrations).toContain("provider text not null check (provider in ('gmail', 'outlook'))");
    expect(allMigrations).toContain('hexigrid_mailbox_id text');
  });

  it('does not put service-role credentials in the frontend schema', () => {
    expect(migrations).not.toMatch(/service[_-]?role|secret[_-]?key/i);
    expect(migrations).toContain('references auth.users(id)');
  });

  it('makes blocks affect profile and post visibility', () => {
    expect(allMigrations).toContain('is_blocked_between');
    expect(allMigrations).toContain('not public.is_blocked_between(auth.uid(), profiles.id)');
    expect(allMigrations).toContain('not public.is_blocked_between(auth.uid(), posts.author_id)');
  });

  it('keeps HexiCoins closed-loop and server-controlled', () => {
    expect(allMigrations).toContain('alpha_starter_credits');
    expect(allMigrations).toContain('send_hexicoin_gift');
    expect(allMigrations).toContain('gift_sends_participant_read');
    expect(allMigrations).not.toContain('cash_out');
    expect(allMigrations).not.toContain('payout');
  });

  it('issues account-based HexiCoins once and keeps the ledger append-only', () => {
    const economy = readFileSync(resolve(migrationDir, '018_hexicoin_integrity_and_referrals.sql'), 'utf8');
    expect(economy).toContain('after insert on auth.users');
    expect(economy).toContain("values (new.id, 1000)");
    expect(economy).toContain("check (entry_type in ('signup_bonus', 'signup_adjustment', 'referral_new_user', 'referral_referrer', 'gift_spend', 'legacy'))");
    expect(economy).toContain('before update or delete on public.hexicoin_ledger');
    expect(economy).toContain('drop constraint if exists hexicoin_ledger_owner_id_fkey');
    expect(economy).toContain('private.anonymize_hexicoin_ledger_account');
    expect(economy).toContain('before delete on auth.users');
    expect(economy).toContain('entry.entry_type = \'referral_referrer\'');
    expect(economy).toContain('idempotency_key');
    expect(economy).toContain('from service_role');
    expect(economy).toContain("grant execute on function public.send_hexicoin_gift(uuid, uuid, text, integer, text, uuid) to authenticated");
    expect(economy).toContain("or (profile.visibility = 'friends' and public.are_profiles_friends(caller, profile.id))");
  });

  it('enforces referral entry, issuance, review, abuse limits, and short signal retention', () => {
    const economy = readFileSync(resolve(migrationDir, '018_hexicoin_integrity_and_referrals.sql'), 'utf8');
    expect(economy).toContain("interval '72 hours'");
    expect(economy).toContain("if referrer = p_owner then");
    expect(economy).toContain('referred_owner uuid not null unique');
    expect(economy).toContain("status in ('pending', 'review', 'credited', 'rejected', 'capped')");
    expect(economy).toContain("interval '24 hours'");
    expect(economy).toContain('latest_observed_at');
    expect(economy).toContain("first_action.latest_observed_at - second_action.observed_at >= interval '24 hours'");
    expect(economy).toContain("interval '30 days'");
    expect(economy).toContain("if attempts_for_user > 5 or attempts_for_ip > 20 or attempts_for_device > 10");
    expect(economy).toContain("if coalesce(credits_total, 0) >= 10");
    expect(economy).toContain("set status = 'capped'");
    expect(economy).toContain('if coalesce(credited_referrals, 0) >= 10');
    expect(economy).toContain("risk := array_append(risk, 'shared_device')");
    expect(economy).toContain('admin_decide_hexicoin_referral');
    expect(economy).toContain('cron.schedule');
    expect(economy).toContain("where submitted_at < now() - interval '30 days'");
    expect(economy).toContain('revoke all on function private.try_settle_hexicoin_referral(uuid) from public, anon, authenticated, service_role');
  });

  it('protects account creation with keyed network limits and short-lived review signals', () => {
    const guard = readFileSync(resolve(migrationDir, '019_hexicoin_signup_guard.sql'), 'utf8');
    expect(guard).toContain("where installed.extname = 'pgcrypto'");
    expect(guard).toContain('.hmac(');
    expect(guard).toContain("accounts_last_hour < 8 and accounts_last_day < 20");
    expect(guard).toContain('grant execute on function public.hexispace_before_user_created(jsonb) to supabase_auth_admin');
    expect(guard).toContain('revoke all on function public.hexispace_before_user_created(jsonb) from public, anon, authenticated, service_role');
    expect(guard).toContain('admin_list_hexicoin_signup_abuse');
    expect(guard).toContain("interval '30 days'");
    expect(guard).not.toMatch(/\b(?:email|user_id)\s+(?:text|varchar|uuid)\b/i);
    expect(guard).not.toMatch(/\bip_address\s+(?:inet|text)\b/i);
  });

  it('keeps the referral submit function behind authenticated edge verification', () => {
    const edge = readFileSync(resolve(root, 'supabase/functions/redeem-hexicoin-referral/index.ts'), 'utf8');
    const economy = readFileSync(resolve(migrationDir, '018_hexicoin_integrity_and_referrals.sql'), 'utf8');
    expect(edge).toContain("auth: 'user'");
    expect(edge).toContain('context.userClaims?.id');
    expect(edge).toContain('keyedReferralDigest');
    expect(edge).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(edge).toContain('context.supabaseAdmin.rpc');
    expect(edge).not.toMatch(/console\.(?:log|error|warn)\s*\(/);
    expect(economy).toContain('grant execute on function public.submit_hexicoin_referral(uuid, text, text, text) to service_role');
    expect(economy).toContain('revoke all on function public.submit_hexicoin_referral(uuid, text, text, text) from public, anon, authenticated');
  });

  it('constrains profile customization to named safe styles', () => {
    expect(allMigrations).toContain('profile_style_shape');
    expect(allMigrations).toContain("'cyan', 'violet', 'amber', 'rose'");
    expect(allMigrations).toContain("'minimal', 'card', 'wide'");
  });

  it('keeps moderation administration behind an explicit owner table and RPC', () => {
    expect(allMigrations).toContain('platform_admins');
    expect(allMigrations).toContain('admin_list_reports');
    expect(allMigrations).toContain('admin_update_report_status');
    expect(allMigrations).toContain('revoke all on table public.platform_admins');
  });

  it('keeps group member moderation behind a role-checked RPC', () => {
    expect(allMigrations).toContain('moderate_hexiverse_group_member');
    expect(allMigrations).toContain("actor_role not in ('admin', 'moderator')");
  });

  it('adds reversible moderation, rate limits, and retention controls', () => {
    expect(allMigrations).toContain('moderation_hidden boolean not null default false');
    expect(allMigrations).toContain('alter table public.messages add column if not exists moderation_hidden');
    expect(allMigrations).toContain('alter table public.rooms add column if not exists moderation_hidden');
    expect(allMigrations).toContain('alter table public.media_assets add column if not exists moderation_hidden');
    expect(allMigrations).toContain('consume_rate_limit');
    expect(allMigrations).toContain('reports_rate_limit');
    expect(allMigrations).toContain('admin_moderate_report');
    expect(allMigrations).toContain('admin_purge_moderation_data');
    expect(allMigrations).toContain('resolution_note');
    expect(allMigrations).toContain("action in ('none', 'hide', 'unhide', 'dismiss')");
    expect(allMigrations).toContain('public.messages set moderation_hidden = true');
    expect(allMigrations).toContain('Media reports require provider-level review');
  });

  it('ships the non-recursive room and group visibility policies', () => {
    expect(allMigrations).toContain('can_view_room');
    expect(allMigrations).toContain('can_view_group');
    expect(allMigrations).toContain('set row_security = off');
  });

  it('includes every numbered migration in the generated one-time setup bundle', async () => {
    const { buildSetupBundle, listMigrationFiles } = await import('../scripts/build-supabase-bundle.mjs');
    const builtFiles = await listMigrationFiles();
    const bundle = await buildSetupBundle();
    expect(builtFiles).toEqual(migrationFiles);
    for (const file of migrationFiles) expect(bundle).toContain(`-- ===== ${file} =====`);
    expect(bundle).toContain('-- ===== 014_public_browse_and_themes.sql =====');
    expect(bundle).toContain('-- ===== 015_greek_deity_themes.sql =====');
    expect(bundle).toContain('-- ===== 016_least_privilege_public_reads.sql =====');
    expect(bundle).toContain('-- ===== 017_private_media_access.sql =====');
    expect(bundle).toContain('-- ===== 018_hexicoin_integrity_and_referrals.sql =====');
    expect(bundle).toContain('-- ===== 019_hexicoin_signup_guard.sql =====');
    expect(bundle).toContain('-- ===== 020_private_profile_ownership.sql =====');
    expect(bundle).toContain('-- ONLY run this against a brand-new, empty Supabase project.');
    expect(bundle).toContain('-- Never rerun it to repair an existing or partially configured project.');
  });
});
