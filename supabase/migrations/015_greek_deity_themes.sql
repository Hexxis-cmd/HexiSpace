-- New theme choices use a Greek-deity ID. Keep old generic IDs accepted so
-- existing profile rows are not silently rewritten; the app maps them when read.
alter table public.profiles alter column theme set default 'hestia';

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme in (
  'helios', 'athena', 'poseidon', 'demeter', 'artemis', 'hestia',
  'hermes', 'hephaestus', 'dionysus', 'aphrodite', 'hera', 'ares',
  'dark', 'light', 'prism', 'parchment', 'obsidian', 'aurora',
  'pulse', 'orbit', 'flux', 'halo', 'ember', 'tidal'
));
