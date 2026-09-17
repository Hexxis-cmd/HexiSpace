alter table public.profiles add column if not exists profile_style jsonb not null default '{"accent":"cyan","backdrop":"midnight","layout":"card","show_badges":true}'::jsonb;
alter table public.profiles add constraint profile_style_shape check (
  jsonb_typeof(profile_style) = 'object'
  and profile_style->>'accent' in ('cyan', 'violet', 'amber', 'rose')
  and profile_style->>'backdrop' in ('midnight', 'mist', 'dusk', 'paper')
  and profile_style->>'layout' in ('minimal', 'card', 'wide')
  and jsonb_typeof(profile_style->'show_badges') = 'boolean'
);
