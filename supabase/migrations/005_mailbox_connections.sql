create table if not exists public.mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  email text not null check (char_length(email) between 3 and 320),
  scopes text[] not null default '{}',
  hexigrid_mailbox_id text,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(owner_id, profile_id, provider, email)
);

alter table public.mailbox_connections add column if not exists hexigrid_mailbox_id text;

create index if not exists mailbox_connections_owner_idx on public.mailbox_connections(owner_id, connected_at desc);
alter table public.mailbox_connections enable row level security;

create policy mailbox_connections_owner on public.mailbox_connections for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and profile_id in (select id from public.profiles where owner_id = auth.uid() and kind = 'hexonaut'));
