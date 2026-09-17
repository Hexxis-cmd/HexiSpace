alter table public.profiles add column if not exists inbox_address text;
create unique index if not exists profiles_inbox_address_idx on public.profiles(inbox_address) where inbox_address is not null;

create table if not exists public.hexonaut_mail (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_label text not null default '' check (char_length(sender_label) <= 160),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 10000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hexonaut_mail_recipient_idx on public.hexonaut_mail(recipient_profile_id, created_at desc);
alter table public.hexonaut_mail enable row level security;

create policy hexonaut_mail_recipient_read on public.hexonaut_mail for select to authenticated using (
  recipient_profile_id in (select id from public.profiles where owner_id = auth.uid())
  or sender_profile_id in (select id from public.profiles where owner_id = auth.uid())
);
create policy hexonaut_mail_recipient_update on public.hexonaut_mail for update to authenticated using (
  recipient_profile_id in (select id from public.profiles where owner_id = auth.uid())
) with check (
  recipient_profile_id in (select id from public.profiles where owner_id = auth.uid())
);
create policy hexonaut_mail_sender_insert on public.hexonaut_mail for insert to authenticated with check (
  sender_profile_id in (select id from public.profiles where owner_id = auth.uid())
  and recipient_profile_id in (
    select id from public.profiles
    where visibility = 'public' or owner_id = auth.uid()
  )
);
