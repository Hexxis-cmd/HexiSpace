-- HexiSpace existing-project preflight. READ ONLY: this file changes no data or settings.
-- Run it in Supabase SQL Editor before attempting to repair an existing project.
-- It reports schema/security metadata only; it never selects user profile or post rows.

select jsonb_pretty(jsonb_build_object(
  'migration_history_table_exists',
    to_regclass('supabase_migrations.schema_migrations') is not null,
  'core_tables', jsonb_build_object(
    'profiles', to_regclass('public.profiles') is not null,
    'posts', to_regclass('public.posts') is not null,
    'media_assets', to_regclass('public.media_assets') is not null,
    'groups', to_regclass('public.groups') is not null,
    'rooms', to_regclass('public.rooms') is not null,
    'messages', to_regclass('public.messages') is not null
  ),
  'public_profile_grants', jsonb_build_object(
    'anonymous_can_read_handle', case
      when to_regclass('public.profiles') is null then false
      else has_column_privilege('anon', 'public.profiles', 'handle', 'select')
    end,
    'anonymous_can_read_private_owner_id', case
      when to_regclass('public.profiles') is null then false
      else has_column_privilege('anon', 'public.profiles', 'owner_id', 'select')
    end,
    'authenticated_can_read_private_owner_id', case
      when to_regclass('public.profiles') is null then false
      else has_column_privilege('authenticated', 'public.profiles', 'owner_id', 'select')
    end,
    'authenticated_can_read_private_inbox_address', case
      when to_regclass('public.profiles') is null then false
      else has_column_privilege('authenticated', 'public.profiles', 'inbox_address', 'select')
    end,
    'authenticated_can_read_safe_owner_rpc', case
      when to_regprocedure('public.my_profiles()') is null then false
      else has_function_privilege('authenticated', 'public.my_profiles()', 'execute')
    end,
    'ownership_policy_helper_exists',
      to_regprocedure('private.is_my_profile(uuid)') is not null,
    'anonymous_has_table_wide_select', case
      when to_regclass('public.profiles') is null then false
      else has_table_privilege('anon', 'public.profiles', 'select')
    end
  ),
  'media_protection', jsonb_build_object(
    'bucket_table_exists', to_regclass('storage.buckets') is not null,
    'public_media_bucket_exists', exists (
      select 1 from storage.buckets where id = 'public-media'
    ),
    'public_media_bucket_is_private', coalesce((
      select not public from storage.buckets where id = 'public-media'
    ), false),
    'visibility_policy_helper_exists',
      to_regprocedure('private.can_read_media_object(text)') is not null,
    'readiness_check_exists',
      to_regprocedure('public.hexispace_media_security_ready()') is not null
  ),
  'relevant_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'name', policyname,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    ) order by schemaname, tablename, policyname), '[]'::jsonb)
    from pg_catalog.pg_policies
    where (schemaname = 'public' and tablename in (
      'profiles', 'posts', 'media_assets', 'groups', 'rooms', 'messages'
    )) or (schemaname = 'storage' and tablename = 'objects')
  ),
  'referral_security', jsonb_build_object(
    'referral_claims_table_exists', to_regclass('private.hexicoin_referral_claims') is not null,
    'referral_status_rpc_exists', to_regprocedure('public.my_hexicoin_referral_status()') is not null,
    'referral_submit_rpc_exists', to_regprocedure('public.submit_hexicoin_referral(uuid,text,text,text)') is not null,
    'idempotent_gift_rpc_exists', to_regprocedure('public.send_hexicoin_gift(uuid,uuid,text,integer,text,uuid)') is not null
  )
)) as hexispace_existing_project_preflight;
