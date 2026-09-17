-- HexiCoins are non-redeemable alpha credits. Only signup, verified referrals,
-- and gift spending may change balances; every change has an immutable ledger row.

alter table public.hexicoin_ledger
  add column if not exists entry_type text not null default 'legacy',
  add column if not exists idempotency_key text,
  add column if not exists reference_id uuid,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

-- Keep the accounting trail after account deletion without retaining a link to
-- the deleted identity. The random replacement UUID is not stored elsewhere.
alter table public.hexicoin_ledger drop constraint if exists hexicoin_ledger_owner_id_fkey;
alter table public.hexicoin_ledger drop constraint if exists hexicoin_ledger_created_by_user_id_fkey;

create or replace function private.anonymize_hexicoin_ledger_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  anonymous_owner uuid;
begin
  loop
    anonymous_owner := gen_random_uuid();
    exit when not exists (select 1 from auth.users where id = anonymous_owner);
  end loop;
  update public.hexicoin_ledger
  set owner_id = case when owner_id = old.id then anonymous_owner else owner_id end,
      created_by_user_id = case when created_by_user_id = old.id then null else created_by_user_id end
  where owner_id = old.id or created_by_user_id = old.id;
  return old;
end;
$function$;

update public.hexicoin_ledger
set entry_type = case
      when reason = 'alpha_starter_credits' then 'signup_bonus'
      when reason like 'gift:%' then 'gift_spend'
      else 'legacy'
    end,
    idempotency_key = coalesce(idempotency_key, 'legacy:' || id::text);

alter table public.hexicoin_ledger
  alter column idempotency_key set not null;
alter table public.hexicoin_ledger
  drop constraint if exists hexicoin_ledger_entry_type_check;
alter table public.hexicoin_ledger
  add constraint hexicoin_ledger_entry_type_check
  check (entry_type in ('signup_bonus', 'signup_adjustment', 'referral_new_user', 'referral_referrer', 'gift_spend', 'legacy'));
create unique index if not exists hexicoin_ledger_idempotency_idx on public.hexicoin_ledger(idempotency_key);

alter table public.gift_sends add column if not exists request_key uuid;
update public.gift_sends set request_key = gen_random_uuid() where request_key is null;
alter table public.gift_sends alter column request_key set not null;
create unique index if not exists gift_sends_request_key_idx on public.gift_sends(sender_profile_id, request_key);

create table if not exists public.hexicoin_referral_codes (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-F0-9]{16}$'),
  created_at timestamptz not null default now()
);
alter table public.hexicoin_referral_codes enable row level security;
drop policy if exists referral_code_owner_read on public.hexicoin_referral_codes;
create policy referral_code_owner_read on public.hexicoin_referral_codes
  for select to authenticated using (owner_id = auth.uid());
revoke all on table public.hexicoin_referral_codes from public, anon, authenticated;
grant select (code, created_at) on table public.hexicoin_referral_codes to authenticated;

create table if not exists private.hexicoin_referral_claims (
  id uuid primary key default gen_random_uuid(),
  referred_owner uuid not null unique references auth.users(id) on delete cascade,
  referrer_owner uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'review', 'credited', 'rejected', 'capped')),
  risk_flags text[] not null default '{}',
  ip_digest text,
  device_digest text,
  submitted_at timestamptz not null default now(),
  credited_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_outcome text check (review_outcome in ('approved', 'rejected')),
  review_note text not null default '',
  check (referred_owner <> referrer_owner),
  check (coalesce(array_length(risk_flags, 1), 0) <= 8),
  check (ip_digest is null or ip_digest ~ '^[a-f0-9]{64}$'),
  check (device_digest is null or device_digest ~ '^[a-f0-9]{64}$')
);
create index if not exists hexicoin_referral_referrer_time_idx
  on private.hexicoin_referral_claims(referrer_owner, submitted_at desc);
create index if not exists hexicoin_referral_credited_time_idx
  on private.hexicoin_referral_claims(referrer_owner, credited_at desc)
  where status = 'credited';
create index if not exists hexicoin_referral_ip_idx
  on private.hexicoin_referral_claims(ip_digest, submitted_at desc)
  where ip_digest is not null;
create index if not exists hexicoin_referral_device_idx
  on private.hexicoin_referral_claims(device_digest, submitted_at desc)
  where device_digest is not null;
revoke all on table private.hexicoin_referral_claims from public, anon, authenticated;

create table if not exists private.hexicoin_referral_attempts (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ip_digest text not null check (ip_digest ~ '^[a-f0-9]{64}$'),
  device_digest text not null check (device_digest ~ '^[a-f0-9]{64}$'),
  attempted_at timestamptz not null default now()
);
create index if not exists hexicoin_referral_attempt_ip_idx
  on private.hexicoin_referral_attempts(ip_digest, attempted_at desc);
create index if not exists hexicoin_referral_attempt_device_idx
  on private.hexicoin_referral_attempts(device_digest, attempted_at desc);
create index if not exists hexicoin_referral_attempt_owner_idx
  on private.hexicoin_referral_attempts(owner_id, attempted_at desc);
revoke all on table private.hexicoin_referral_attempts from public, anon, authenticated;

create table if not exists private.hexicoin_referral_activity (
  claim_id uuid not null references private.hexicoin_referral_claims(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('post', 'comment', 'reaction', 'follow', 'group_join')),
  observed_at timestamptz not null default clock_timestamp(),
  primary key (claim_id, category)
);
create index if not exists hexicoin_referral_activity_owner_idx
  on private.hexicoin_referral_activity(owner_id, observed_at desc);
alter table private.hexicoin_referral_activity
  add column if not exists latest_observed_at timestamptz not null default clock_timestamp();
revoke all on table private.hexicoin_referral_activity from public, anon, authenticated;

-- Bring existing test accounts up to the same 1,000-credit signup grant.
with created_wallets as (
  insert into public.hexicoin_wallets(owner_id, balance)
  select users.id, 1000
  from auth.users users
  on conflict (owner_id) do nothing
  returning owner_id
)
insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key)
select owner_id, 1000, 'alpha_starter_credits', 'signup_bonus', 'signup:' || owner_id::text
from created_wallets
on conflict (idempotency_key) do nothing;

with topped_up_wallets as (
  update public.hexicoin_wallets wallet
  set balance = wallet.balance + 900
  where exists (
    select 1 from public.hexicoin_ledger ledger
    where ledger.owner_id = wallet.owner_id
      and ledger.reason = 'alpha_starter_credits'
      and ledger.delta = 100
  )
    and not exists (
      select 1 from public.hexicoin_ledger ledger
      where ledger.owner_id = wallet.owner_id
        and ledger.reason = 'alpha_starter_adjustment'
    )
  returning owner_id
)
insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key)
select owner_id, 900, 'alpha_starter_adjustment', 'signup_adjustment', 'signup-adjustment:' || owner_id::text
from topped_up_wallets
on conflict (idempotency_key) do nothing;

-- Each auth account receives one wallet and one referral code, regardless of how
-- many Human or Hexonaut profiles it later creates.
create or replace function private.initialize_hexicoin_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  generated_code text;
begin
  insert into public.hexicoin_wallets(owner_id, balance)
  values (new.id, 1000)
  on conflict (owner_id) do nothing;
  if found then
    insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key)
    values (new.id, 1000, 'alpha_starter_credits', 'signup_bonus', 'signup:' || new.id::text)
    on conflict (idempotency_key) do nothing;
  end if;

  if not exists (select 1 from public.hexicoin_referral_codes where owner_id = new.id) then
    loop
      generated_code := upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
      begin
        insert into public.hexicoin_referral_codes(owner_id, code)
        values (new.id, generated_code)
        on conflict (owner_id) do nothing;
        exit;
      exception when unique_violation then
        -- A code collision is exceptionally unlikely; generate another securely.
      end;
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_hexicoin_wallet on public.profiles;
drop function if exists public.ensure_hexicoin_wallet();
drop trigger if exists auth_user_hexicoin_account on auth.users;
create trigger auth_user_hexicoin_account
after insert on auth.users
for each row execute function private.initialize_hexicoin_account();

insert into public.hexicoin_referral_codes(owner_id, code)
select users.id,
       upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16))
from auth.users users
on conflict (owner_id) do nothing;

create or replace function private.record_hexicoin_referral_activity(p_owner uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_claim uuid;
begin
  if p_owner is null or auth.uid() is null or auth.uid() <> p_owner then return; end if;
  select claim.id into target_claim
  from private.hexicoin_referral_claims claim
  where claim.referred_owner = p_owner and claim.status in ('pending', 'review')
  for update;
  if target_claim is null then return; end if;
  insert into private.hexicoin_referral_activity(claim_id, owner_id, category)
  values (target_claim, p_owner, p_category)
  on conflict (claim_id, category) do update
  set latest_observed_at = greatest(private.hexicoin_referral_activity.latest_observed_at, excluded.latest_observed_at);
  perform private.try_settle_hexicoin_referral(target_claim);
end;
$function$;

create or replace function private.try_settle_hexicoin_referral(p_claim uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claim private.hexicoin_referral_claims;
  referrer_verified boolean;
  referred_verified boolean;
  referrer_has_profile boolean;
  referred_has_profile boolean;
  authentic_activity boolean;
  credits_24h integer;
  credits_30d integer;
  credits_total integer;
  wallet_rows integer;
begin
  select * into claim
  from private.hexicoin_referral_claims
  where id = p_claim
  for update;
  if not found or claim.status <> 'pending' then return false; end if;

  select coalesce(bool_or(users.email_confirmed_at is not null) filter (where users.id = claim.referrer_owner), false),
         coalesce(bool_or(users.email_confirmed_at is not null) filter (where users.id = claim.referred_owner), false)
  into referrer_verified, referred_verified
  from auth.users users
  where users.id in (claim.referrer_owner, claim.referred_owner);
  if not coalesce(referrer_verified, false) or not coalesce(referred_verified, false) then return false; end if;

  select exists (select 1 from public.profiles where owner_id = claim.referrer_owner),
         exists (select 1 from public.profiles where owner_id = claim.referred_owner)
  into referrer_has_profile, referred_has_profile;
  if not referrer_has_profile or not referred_has_profile then return false; end if;

  select exists (
    select 1
    from private.hexicoin_referral_activity first_action
    join private.hexicoin_referral_activity second_action
     on second_action.claim_id = first_action.claim_id
     and second_action.category <> first_action.category
     and (
       first_action.latest_observed_at - second_action.observed_at >= interval '24 hours'
       or second_action.latest_observed_at - first_action.observed_at >= interval '24 hours'
     )
    where first_action.claim_id = claim.id
  ) into authentic_activity;
  if not authentic_activity then return false; end if;

  -- Acquire wallet locks in stable order so concurrent referrals cannot spend
  -- the same issuance slot or deadlock when two referrers are also invitees.
  perform 1
  from public.hexicoin_wallets wallet
  where wallet.owner_id in (claim.referrer_owner, claim.referred_owner)
  order by wallet.owner_id
  for update;

  select count(*) filter (where entry.created_at >= now() - interval '24 hours')::integer,
         count(*) filter (where entry.created_at >= now() - interval '30 days')::integer,
         count(*)::integer
  into credits_24h, credits_30d, credits_total
  from public.hexicoin_ledger entry
  where entry.owner_id = claim.referrer_owner
    and entry.entry_type = 'referral_referrer'
    and entry.delta = 500
    and entry.reason = 'successful_referral_bonus';
  if coalesce(credits_total, 0) >= 10 then
    update private.hexicoin_referral_claims set status = 'capped'
    where id = claim.id and status = 'pending';
    return false;
  end if;
  if coalesce(credits_24h, 0) >= 2 or coalesce(credits_30d, 0) >= 5 then return false; end if;

  if exists (
    select 1 from public.hexicoin_ledger
    where idempotency_key in ('referral:' || claim.id::text || ':new-user', 'referral:' || claim.id::text || ':referrer')
  ) then
    raise exception 'Referral ledger state is inconsistent; no additional credits were issued.';
  end if;

  update public.hexicoin_wallets
  set balance = balance + 500
  where owner_id in (claim.referrer_owner, claim.referred_owner);
  get diagnostics wallet_rows = row_count;
  if wallet_rows <> 2 then raise exception 'Referral wallet is missing.'; end if;

  insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key, reference_id, created_by_user_id)
  values
    (claim.referred_owner, 500, 'referral_welcome_bonus', 'referral_new_user', 'referral:' || claim.id::text || ':new-user', claim.id, claim.referred_owner),
    (claim.referrer_owner, 500, 'successful_referral_bonus', 'referral_referrer', 'referral:' || claim.id::text || ':referrer', claim.id, claim.referred_owner);

  update private.hexicoin_referral_claims
  set status = 'credited', credited_at = clock_timestamp()
  where id = claim.id and status = 'pending';
  if not found then raise exception 'Referral claim changed while credits were being issued.'; end if;
  return true;
end;
$function$;

create or replace function public.submit_hexicoin_referral(p_owner uuid, p_code text, p_ip_digest text, p_device_digest text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_code text;
  referrer uuid;
  claim private.hexicoin_referral_claims;
  risk text[] := array[]::text[];
  attempts_for_user integer;
  attempts_for_ip integer;
  attempts_for_device integer;
  active_claims integer;
  credited_referrals integer;
  submissions_24h integer;
  submissions_30d integer;
  account_created_at timestamptz;
  advisory_key bigint;
begin
  if p_owner is null or p_ip_digest !~ '^[a-f0-9]{64}$' or p_device_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'Referral check could not be completed.';
  end if;
  normalized_code := pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, ''))), '^HX[- ]?', '');
  normalized_code := pg_catalog.regexp_replace(normalized_code, '[^A-F0-9]', '', 'g');

  for advisory_key in
    select distinct pg_catalog.hashtextextended(key_text, 0)
    from unnest(array['owner:' || p_owner::text, 'ip:' || p_ip_digest, 'device:' || p_device_digest]) as signals(key_text)
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(advisory_key);
  end loop;

  delete from private.hexicoin_referral_attempts
  where attempted_at < now() - interval '30 days';
  update private.hexicoin_referral_claims
  set ip_digest = null, device_digest = null
  where submitted_at < now() - interval '30 days'
    and (ip_digest is not null or device_digest is not null);

  insert into private.hexicoin_referral_attempts(owner_id, ip_digest, device_digest)
  values (p_owner, p_ip_digest, p_device_digest);

  select count(*)::integer into attempts_for_user
  from private.hexicoin_referral_attempts
  where owner_id = p_owner and attempted_at >= now() - interval '1 hour';
  select count(*)::integer into attempts_for_ip
  from private.hexicoin_referral_attempts
  where ip_digest = p_ip_digest and attempted_at >= now() - interval '1 hour';
  select count(*)::integer into attempts_for_device
  from private.hexicoin_referral_attempts
  where device_digest = p_device_digest and attempted_at >= now() - interval '1 hour';
  if attempts_for_user > 5 or attempts_for_ip > 20 or attempts_for_device > 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into claim from private.hexicoin_referral_claims where referred_owner = p_owner;
  if found then
    select owner_id into referrer from public.hexicoin_referral_codes where code = normalized_code;
    if referrer = claim.referrer_owner then return jsonb_build_object('status', claim.status); end if;
    return jsonb_build_object('status', 'already_redeemed');
  end if;

  if normalized_code !~ '^[A-F0-9]{16}$' then return jsonb_build_object('status', 'invalid_code'); end if;
  select created_at into account_created_at from auth.users where id = p_owner;
  if not found then return jsonb_build_object('status', 'invalid_account'); end if;
  if account_created_at <= now() - interval '72 hours' then
    return jsonb_build_object('status', 'window_closed');
  end if;

  select codes.owner_id into referrer
  from public.hexicoin_referral_codes codes
  where codes.code = normalized_code
  for update;
  if referrer is null then return jsonb_build_object('status', 'invalid_code'); end if;
  if referrer = p_owner then return jsonb_build_object('status', 'self_referral'); end if;

  select count(*) filter (where status in ('pending', 'review', 'credited'))::integer,
         count(*) filter (where submitted_at >= now() - interval '24 hours')::integer,
         count(*) filter (where submitted_at >= now() - interval '30 days')::integer
  into active_claims, submissions_24h, submissions_30d
  from private.hexicoin_referral_claims
  where referrer_owner = referrer;
  select count(*)::integer into credited_referrals
  from public.hexicoin_ledger entry
  where entry.owner_id = referrer
    and entry.entry_type = 'referral_referrer'
    and entry.delta = 500
    and entry.reason = 'successful_referral_bonus';
  if coalesce(credited_referrals, 0) >= 10 then return jsonb_build_object('status', 'referrer_cap'); end if;
  if active_claims >= 10 then return jsonb_build_object('status', 'referrer_cap'); end if;
  if submissions_24h >= 2 or submissions_30d >= 5 then return jsonb_build_object('status', 'rate_limited'); end if;

  if exists (
    select 1 from private.hexicoin_referral_attempts
    where owner_id <> p_owner and device_digest = p_device_digest
      and attempted_at >= now() - interval '30 days'
  ) then risk := array_append(risk, 'shared_device'); end if;
  if exists (
    select 1 from private.hexicoin_referral_attempts
    where owner_id <> p_owner and ip_digest = p_ip_digest
      and attempted_at >= now() - interval '30 days'
  ) then risk := array_append(risk, 'shared_ip'); end if;
  if (
    select count(distinct owner_id)
    from private.hexicoin_referral_attempts
    where ip_digest = p_ip_digest and attempted_at >= now() - interval '24 hours'
  ) >= 3 then risk := array_append(risk, 'ip_velocity'); end if;

  insert into private.hexicoin_referral_claims(
    referred_owner, referrer_owner, status, risk_flags, ip_digest, device_digest
  ) values (
    p_owner, referrer, case when cardinality(risk) > 0 then 'review' else 'pending' end,
    risk, p_ip_digest, p_device_digest
  ) returning * into claim;

  if claim.status = 'pending' then perform private.try_settle_hexicoin_referral(claim.id); end if;
  select * into claim from private.hexicoin_referral_claims where id = claim.id;
  return jsonb_build_object('status', claim.status, 'submitted_at', claim.submitted_at);
end;
$function$;

create or replace function public.my_hexicoin_referral_status()
returns table (referral_code text, referral_deadline timestamptz, claim_status text, credited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select case when codes.code is null then null else
           'HX-' || pg_catalog.substr(codes.code, 1, 4) || '-' || pg_catalog.substr(codes.code, 5, 4) || '-' || pg_catalog.substr(codes.code, 9, 4) || '-' || pg_catalog.substr(codes.code, 13, 4)
         end,
         users.created_at + interval '72 hours',
         claim.status,
         claim.credited_at
  from auth.users users
  left join public.hexicoin_referral_codes codes on codes.owner_id = users.id
  left join private.hexicoin_referral_claims claim on claim.referred_owner = users.id
  where users.id = auth.uid();
$function$;

create or replace function public.admin_list_hexicoin_referral_reviews()
returns table (
  claim_id uuid,
  submitted_at timestamptz,
  referred_profile text,
  referrer_profile text,
  risk_flags text[],
  email_verified boolean,
  profile_created boolean,
  activity_categories text[],
  activity_span_hours numeric,
  review_note text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (select 1 from public.platform_admins admins where admins.user_id = auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  return query
  select claim.id,
         claim.submitted_at,
         coalesce((select profile.display_name || ' (@' || profile.handle || ')'
                   from public.profiles profile where profile.owner_id = claim.referred_owner order by profile.created_at limit 1), 'Profile not created'),
         coalesce((select profile.display_name || ' (@' || profile.handle || ')'
                   from public.profiles profile where profile.owner_id = claim.referrer_owner order by profile.created_at limit 1), 'Profile not created'),
         claim.risk_flags,
         exists (select 1 from auth.users users where users.id = claim.referred_owner and users.email_confirmed_at is not null),
         exists (select 1 from public.profiles profile where profile.owner_id = claim.referred_owner),
         coalesce((select array_agg(activity.category order by activity.observed_at)
                   from private.hexicoin_referral_activity activity where activity.claim_id = claim.id), array[]::text[]),
         (select round((extract(epoch from (max(activity.latest_observed_at) - min(activity.observed_at))) / 3600)::numeric, 1)
          from private.hexicoin_referral_activity activity where activity.claim_id = claim.id),
         claim.review_note
  from private.hexicoin_referral_claims claim
  where claim.status = 'review'
  order by claim.submitted_at asc
  limit 200;
end;
$function$;

create or replace function public.admin_decide_hexicoin_referral(p_claim uuid, p_decision text, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_claim private.hexicoin_referral_claims;
  final_status text;
begin
  if not exists (select 1 from public.platform_admins admins where admins.user_id = auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  if p_decision not in ('approve', 'reject') or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_note, ''))) < 5
     or pg_catalog.char_length(p_note) > 500 then
    raise exception 'Choose approve or reject and include a short review note.';
  end if;
  select * into current_claim from private.hexicoin_referral_claims where id = p_claim for update;
  if not found or current_claim.status <> 'review' then raise exception 'This referral is no longer awaiting review.'; end if;
  update private.hexicoin_referral_claims
  set status = case when p_decision = 'approve' then 'pending' else 'rejected' end,
      reviewed_at = clock_timestamp(), reviewed_by = auth.uid(),
      review_outcome = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_note = pg_catalog.left(pg_catalog.btrim(p_note), 500)
  where id = p_claim;
  if p_decision = 'approve' then
    perform private.try_settle_hexicoin_referral(p_claim);
    select status into final_status from private.hexicoin_referral_claims where id = p_claim;
    return final_status;
  end if;
  return 'rejected';
end;
$function$;

create or replace function private.process_pending_hexicoin_referrals()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claim_row record;
  settled_count integer := 0;
begin
  for claim_row in
    select id from private.hexicoin_referral_claims
    where status = 'pending'
    order by submitted_at
    limit 200
  loop
    if private.try_settle_hexicoin_referral(claim_row.id) then settled_count := settled_count + 1; end if;
  end loop;
  delete from private.hexicoin_referral_attempts where attempted_at < now() - interval '30 days';
  update private.hexicoin_referral_claims
  set ip_digest = null, device_digest = null
  where submitted_at < now() - interval '30 days'
    and (ip_digest is not null or device_digest is not null);
  return settled_count;
end;
$function$;

create or replace function private.capture_referral_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() = new.owner_id then perform private.try_settle_hexicoin_referral_for_owner(new.owner_id); end if;
  return new;
end;
$function$;

create or replace function private.try_settle_hexicoin_referral_for_owner(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claim_row record;
begin
  for claim_row in
    select id from private.hexicoin_referral_claims
    where (referred_owner = p_owner or referrer_owner = p_owner) and status = 'pending'
    order by submitted_at
    for update
  loop
    perform private.try_settle_hexicoin_referral(claim_row.id);
  end loop;
end;
$function$;

create or replace function private.capture_referral_email_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is distinct from new.email_confirmed_at then
    perform private.try_settle_hexicoin_referral_for_owner(new.id);
  end if;
  return new;
end;
$function$;

create or replace function private.capture_referral_post_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_owner uuid;
begin
  if new.moderation_hidden or new.visibility not in ('public', 'friends') or pg_catalog.char_length(pg_catalog.btrim(new.body)) < 40 then return new; end if;
  select owner_id into actor_owner from public.profiles where id = new.author_id and owner_id = auth.uid();
  if actor_owner is not null then perform private.record_hexicoin_referral_activity(actor_owner, 'post'); end if;
  return new;
end;
$function$;

create or replace function private.capture_referral_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_owner uuid;
begin
  if new.moderation_hidden or pg_catalog.char_length(pg_catalog.btrim(new.body)) < 20 then return new; end if;
  select profile.owner_id into actor_owner
  from public.profiles profile
  join public.posts post on post.id = new.post_id
  join public.profiles author on author.id = post.author_id
  where profile.id = new.author_id and profile.owner_id = auth.uid()
    and author.owner_id <> profile.owner_id
    and post.visibility = 'public' and not post.moderation_hidden;
  if actor_owner is not null then perform private.record_hexicoin_referral_activity(actor_owner, 'comment'); end if;
  return new;
end;
$function$;

create or replace function private.capture_referral_reaction_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_owner uuid;
begin
  select profile.owner_id into actor_owner
  from public.profiles profile
  join public.posts post on post.id = new.post_id
  join public.profiles author on author.id = post.author_id
  where profile.id = new.profile_id and profile.owner_id = auth.uid()
    and author.owner_id <> profile.owner_id
    and post.visibility = 'public' and not post.moderation_hidden;
  if actor_owner is not null then perform private.record_hexicoin_referral_activity(actor_owner, 'reaction'); end if;
  return new;
end;
$function$;

create or replace function private.capture_referral_follow_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_owner uuid;
begin
  select follower.owner_id into actor_owner
  from public.profiles follower
  join public.profiles target on target.id = new.following_id
  where follower.id = new.follower_id and follower.owner_id = auth.uid()
    and target.owner_id <> follower.owner_id;
  if actor_owner is not null then perform private.record_hexicoin_referral_activity(actor_owner, 'follow'); end if;
  return new;
end;
$function$;

create or replace function private.capture_referral_group_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_owner uuid;
begin
  if new.status <> 'active' then return new; end if;
  select profile.owner_id into actor_owner
  from public.profiles profile
  join public.groups community on community.id = new.group_id
  where profile.id = new.profile_id and profile.owner_id = auth.uid()
    and community.owner_id <> profile.owner_id and community.visibility = 'public';
  if actor_owner is not null then perform private.record_hexicoin_referral_activity(actor_owner, 'group_join'); end if;
  return new;
end;
$function$;

create or replace function private.reject_hexicoin_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Account deletion may cascade to its own ledger history. Direct edits are
  -- always rejected; ordinary clients have no table write grants either.
  if pg_catalog.pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'HexiCoin ledger entries are append-only.';
end;
$function$;

create or replace function public.send_hexicoin_gift(
  sender_profile_id uuid,
  recipient_profile_id uuid,
  requested_gift_key text,
  gift_quantity integer,
  gift_note text,
  request_key uuid
)
returns public.gift_sends
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
  recipient_owner uuid;
  gift public.gift_catalog;
  result public.gift_sends;
  existing public.gift_sends;
  current_balance integer;
  total_cost integer;
  recent_gifts integer;
begin
  if caller is null then raise exception 'Sign in to send a gift.'; end if;
  if request_key is null then raise exception 'A gift request key is required.'; end if;
  if gift_quantity is null or gift_quantity < 1 or gift_quantity > 20 then raise exception 'Choose between 1 and 20 gifts.'; end if;
  if pg_catalog.char_length(coalesce(gift_note, '')) > 300 then raise exception 'Gift messages must be 300 characters or fewer.'; end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(gift_note, ''))) = 0 then gift_note := ''; end if;

  if not exists (select 1 from public.profiles where id = sender_profile_id and owner_id = caller) then
    raise exception 'The sender profile is not owned by the signed-in user.';
  end if;
  select owner_id into recipient_owner
  from public.profiles profile
  where profile.id = recipient_profile_id
    and not profile.moderation_hidden
    and (
      profile.visibility = 'public'
      or (profile.visibility = 'friends' and public.are_profiles_friends(caller, profile.id))
    );
  if recipient_owner is null or recipient_owner = caller then raise exception 'Choose another account to receive this gift.'; end if;
  if public.is_blocked_between(caller, recipient_profile_id) then raise exception 'This profile is unavailable.'; end if;
  if sender_profile_id = recipient_profile_id then raise exception 'A profile cannot send a gift to itself.'; end if;

  select * into gift from public.gift_catalog catalog
  where catalog.gift_key = requested_gift_key and catalog.enabled = true;
  if gift.id is null then raise exception 'That gift is not available.'; end if;
  total_cost := gift.cost * gift_quantity;

  select balance into current_balance
  from public.hexicoin_wallets where owner_id = caller for update;
  if not found then raise exception 'The HexiCoin wallet is unavailable.'; end if;

  -- The wallet row serializes retries using the same request key. Checking only
  -- before this lock would let simultaneous retries race into a unique error.
  select * into existing from public.gift_sends sent
  where sent.sender_profile_id = $1 and sent.request_key = $6;
  if found then
    if existing.recipient_profile_id = recipient_profile_id
       and existing.gift_id = gift.id
       and existing.quantity = gift_quantity
       and existing.note = gift_note then return existing; end if;
    raise exception 'This request key was already used for a different gift.';
  end if;
  select count(*)::integer into recent_gifts
  from public.gift_sends sent
  join public.profiles sender on sender.id = sent.sender_profile_id
  where sender.owner_id = caller and sent.created_at >= now() - interval '24 hours';
  if recent_gifts >= 30 then raise exception 'Daily gift limit reached. Try again later.'; end if;
  if current_balance < total_cost then raise exception 'Not enough HexiCoins for that gift.'; end if;

  update public.hexicoin_wallets set balance = balance - total_cost where owner_id = caller;
  insert into public.gift_sends(sender_profile_id, recipient_profile_id, gift_id, quantity, note, request_key)
  values (sender_profile_id, recipient_profile_id, gift.id, gift_quantity, gift_note, request_key)
  returning * into result;
  insert into public.hexicoin_ledger(owner_id, delta, reason, entry_type, idempotency_key, reference_id, created_by_user_id)
  values (caller, -total_cost, 'gift:' || gift.gift_key, 'gift_spend', 'gift:' || result.id::text || ':spend', result.id, caller);
  insert into public.notifications(owner_id, kind, title, body)
  values (recipient_owner, 'gift', 'You received a gift',
          (select display_name from public.profiles where id = sender_profile_id) || ' sent you a ' || gift.name || '.');
  return result;
end;
$function$;

revoke all on function public.send_hexicoin_gift(uuid, uuid, text, integer, text) from public, anon, authenticated;
drop function public.send_hexicoin_gift(uuid, uuid, text, integer, text);
revoke all on function public.send_hexicoin_gift(uuid, uuid, text, integer, text, uuid) from public, anon;
grant execute on function public.send_hexicoin_gift(uuid, uuid, text, integer, text, uuid) to authenticated;

revoke all on function public.submit_hexicoin_referral(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_hexicoin_referral(uuid, text, text, text) to service_role;
revoke all on function public.my_hexicoin_referral_status() from public, anon;
grant execute on function public.my_hexicoin_referral_status() to authenticated;
revoke all on function public.admin_list_hexicoin_referral_reviews() from public, anon;
revoke all on function public.admin_decide_hexicoin_referral(uuid, text, text) from public, anon;
grant execute on function public.admin_list_hexicoin_referral_reviews() to authenticated;
grant execute on function public.admin_decide_hexicoin_referral(uuid, text, text) to authenticated;

drop trigger if exists hexicoin_ledger_append_only on public.hexicoin_ledger;
create trigger hexicoin_ledger_append_only
before update or delete on public.hexicoin_ledger
for each row execute function private.reject_hexicoin_ledger_mutation();

drop trigger if exists hexicoin_referral_profile_activity on public.profiles;
create trigger hexicoin_referral_profile_activity
after insert on public.profiles
for each row execute function private.capture_referral_profile_activity();
drop trigger if exists hexicoin_referral_email_verification on auth.users;
create trigger hexicoin_referral_email_verification
after update of email_confirmed_at on auth.users
for each row execute function private.capture_referral_email_verification();
drop trigger if exists hexicoin_referral_posts on public.posts;
create trigger hexicoin_referral_posts after insert on public.posts
for each row execute function private.capture_referral_post_activity();
drop trigger if exists hexicoin_referral_comments on public.comments;
create trigger hexicoin_referral_comments after insert on public.comments
for each row execute function private.capture_referral_comment_activity();
drop trigger if exists hexicoin_referral_reactions on public.reactions;
create trigger hexicoin_referral_reactions after insert on public.reactions
for each row execute function private.capture_referral_reaction_activity();
drop trigger if exists hexicoin_referral_follows on public.follows;
create trigger hexicoin_referral_follows after insert on public.follows
for each row execute function private.capture_referral_follow_activity();
drop trigger if exists hexicoin_referral_group_members on public.group_members;
create trigger hexicoin_referral_group_members after insert or update of status on public.group_members
for each row execute function private.capture_referral_group_activity();

revoke all on table public.hexicoin_wallets, public.hexicoin_ledger, public.gift_catalog, public.gift_sends from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.hexicoin_wallets, public.hexicoin_ledger, public.gift_catalog, public.gift_sends from service_role;
grant select (owner_id, balance, created_at) on table public.hexicoin_wallets to authenticated;
grant select (id, owner_id, delta, reason, entry_type, reference_id, created_by_user_id, created_at)
  on table public.hexicoin_ledger to authenticated;
grant select (id, gift_key, name, description, cost, icon, enabled) on table public.gift_catalog to authenticated;
grant select (id, sender_profile_id, recipient_profile_id, gift_id, quantity, note, created_at)
  on table public.gift_sends to authenticated;
grant select on table public.hexicoin_wallets, public.hexicoin_ledger, public.gift_catalog, public.gift_sends to service_role;
revoke insert, update, delete, truncate on table public.hexicoin_wallets, public.hexicoin_ledger, public.gift_catalog, public.gift_sends
  from public, anon, authenticated;

-- Daily processing releases referrals whose 24-hour/30-day issuance slot has
-- opened and clears keyed abuse signals after their 30-day review window.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
  'hexicoin-referral-maintenance',
  '17 4 * * *',
  'select private.process_pending_hexicoin_referrals()'
);

-- Private routines are reachable only through their checked public entry points
-- or trusted database triggers. Keep the media-visibility predicate from 017
-- callable because Storage RLS policies use it directly.
revoke all on function private.initialize_hexicoin_account() from public, anon, authenticated, service_role;
revoke all on function private.anonymize_hexicoin_ledger_account() from public, anon, authenticated, service_role;
revoke all on function private.record_hexicoin_referral_activity(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.try_settle_hexicoin_referral(uuid) from public, anon, authenticated, service_role;
revoke all on function private.process_pending_hexicoin_referrals() from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_profile_activity() from public, anon, authenticated, service_role;
revoke all on function private.try_settle_hexicoin_referral_for_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_email_verification() from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_post_activity() from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_comment_activity() from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_reaction_activity() from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_follow_activity() from public, anon, authenticated, service_role;
revoke all on function private.capture_referral_group_activity() from public, anon, authenticated, service_role;
revoke all on function private.reject_hexicoin_ledger_mutation() from public, anon, authenticated, service_role;

drop trigger if exists auth_user_hexicoin_anonymize_ledger on auth.users;
create trigger auth_user_hexicoin_anonymize_ledger
before delete on auth.users
for each row execute function private.anonymize_hexicoin_ledger_account();
