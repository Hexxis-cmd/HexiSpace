import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let db: PGlite;
const adminId = '10000000-0000-4000-8000-000000000001';

function event(id: number, ip = '203.0.113.24') {
  return {
    metadata: {
      uuid: `20000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
      name: 'before-user-created',
      ip_address: ip
    },
    user: {
      id: `30000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
      email: `person-${id}@example.test`
    }
  };
}

async function checkSignup(payload: unknown) {
  const { rows } = await db.query<{ result: Record<string, unknown> }>(
    'select public.hexispace_before_user_created($1::jsonb) as result', [JSON.stringify(payload)]
  );
  return rows[0]!.result;
}

describe('pre-signup HexiCoin abuse guard', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create role supabase_auth_admin;
      create schema auth;
      create schema private;
      create schema cron;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.platform_admins(user_id uuid primary key);
      create table cron.scheduled_jobs (
        id bigint generated always as identity primary key,
        jobname text not null,
        schedule text not null,
        command text not null
      );
      create function cron.schedule(text, text, text) returns bigint
      language plpgsql as $$ declare created_id bigint; begin
        insert into cron.scheduled_jobs(jobname, schedule, command)
        values ($1, $2, $3) returning id into created_id;
        return created_id;
      end $$;
      grant usage on schema auth, private, cron, public to anon, authenticated, service_role, supabase_auth_admin;
      grant execute on function auth.uid() to authenticated;
    `);

    const migration = await (await import('node:fs/promises')).readFile(
      new URL('../supabase/migrations/019_hexicoin_signup_guard.sql', import.meta.url), 'utf8'
    );
    await db.exec(migration);

    // PGlite has no pgcrypto extension. Replace only the keyed digest primitive
    // with a deterministic test double; the production migration always uses
    // pgcrypto HMAC-SHA256 and this test exercises the actual guard logic.
    await db.exec(`create or replace function private.hexicoin_signup_ip_digest(p_ip inet)
      returns text language sql security definer set search_path = '' as $$
      select pg_catalog.md5(pg_catalog.host(p_ip)) || pg_catalog.md5('test:' || pg_catalog.host(p_ip))
    $$`);
    await db.query('insert into public.platform_admins(user_id) values ($1)', [adminId]);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it('fails closed when Supabase omits the signup ID or network address', async () => {
    const missingIp = await checkSignup({ ...event(1), metadata: { ...event(1).metadata, ip_address: '' } });
    expect(missingIp).toMatchObject({ error: { http_code: 503 } });
    const missingId = await checkSignup({ ...event(2), metadata: { name: 'before-user-created', ip_address: '203.0.113.24' } });
    expect(missingId).toMatchObject({ error: { http_code: 503 } });
    const missingUser = await checkSignup({ ...event(3), user: { email: 'person@example.test' } });
    expect(missingUser).toMatchObject({ error: { http_code: 503 } });
    const stored = await db.query<{ count: number }>('select count(*)::int as count from private.hexicoin_signup_guard_events');
    expect(stored.rows[0]?.count).toBe(0);
  });

  it('allows eight new accounts per network per hour, flags unusual bursts, and blocks the next', async () => {
    await db.exec('set role supabase_auth_admin');
    for (let id = 1; id <= 8; id++) expect(await checkSignup(event(id))).toEqual({});
    const blocked = await checkSignup(event(9));
    expect(blocked).toMatchObject({ error: { http_code: 429 } });
    expect(await checkSignup(event(9))).toMatchObject({ error: { http_code: 429 } });
    await db.exec('reset role');

    const stored = await db.query<{ count: number; raw_address: boolean; raw_email: boolean }>(`
      select count(*)::int as count,
        bool_or(ip_digest like '%203.0.113.24%') as raw_address,
        bool_or(ip_digest like '%example.test%') as raw_email
      from private.hexicoin_signup_guard_events
    `);
    expect(stored.rows[0]).toEqual({ count: 9, raw_address: false, raw_email: false });

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId]);
    await db.exec('set role authenticated');
    const review = await db.query<{ account_creations: number; blocked_attempts: number; signals: string[] }>(
      'select account_creations, blocked_attempts, signals from public.admin_list_hexicoin_signup_abuse()'
    );
    await db.exec('reset role');
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]).toMatchObject({ account_creations: 8, blocked_attempts: 1 });
    expect(review.rows[0]!.signals).toContain('elevated_hourly_signup_velocity');
    expect(review.rows[0]!.signals).toContain('hourly_signup_limit');

    await db.query("update private.hexicoin_signup_guard_events set created_at = clock_timestamp() - interval '2 hours' where ip_digest = private.hexicoin_signup_ip_digest('203.0.113.24'::inet)");
    expect(await checkSignup(event(10))).toEqual({});
  });

  it('replays a Supabase hook event idempotently and enforces the 24-hour ceiling', async () => {
    const first = await checkSignup(event(100, '198.51.100.19'));
    const retry = await checkSignup(event(100, '198.51.100.19'));
    expect(first).toEqual({});
    expect(retry).toEqual({});
    const single = await db.query<{ count: number }>(
      "select count(*)::int as count from private.hexicoin_signup_guard_events where ip_digest = private.hexicoin_signup_ip_digest('198.51.100.19'::inet)"
    );
    expect(single.rows[0]?.count).toBe(1);

    const digest = await db.query<{ value: string }>(
      "select private.hexicoin_signup_ip_digest('198.51.100.20'::inet) as value"
    );
    await db.query(`insert into private.hexicoin_signup_guard_events(event_id, ip_digest, accepted, created_at)
      select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, $1, true,
        pg_catalog.clock_timestamp() - interval '2 hours'
      from generate_series(1, 20) as n`, [digest.rows[0]!.value]);
    const dailyLimit = await checkSignup(event(101, '198.51.100.20'));
    expect(dailyLimit).toMatchObject({ error: { http_code: 429 } });
  });

  it('allows only Supabase Auth and approved owners to call their respective entry points', async () => {
    await db.exec('set role authenticated');
    await expect(db.query('select public.hexispace_before_user_created($1::jsonb)', [JSON.stringify(event(200))]))
      .rejects.toThrow(/permission denied/i);
    await db.exec('reset role');

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['10000000-0000-4000-8000-000000000099']);
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.admin_list_hexicoin_signup_abuse()'))
      .rejects.toThrow(/not authorized/i);
    await db.exec('reset role');
  });

  it('deletes keyed network signals after 30 days', async () => {
    await db.exec("update private.hexicoin_signup_guard_events set created_at = now() - interval '31 days'");
    const deleted = await db.query<{ count: number }>('select private.cleanup_hexicoin_signup_guard_events() as count');
    expect(deleted.rows[0]?.count).toBeGreaterThan(0);
    const remaining = await db.query<{ count: number }>('select count(*)::int as count from private.hexicoin_signup_guard_events');
    expect(remaining.rows[0]?.count).toBe(0);
  });
});
