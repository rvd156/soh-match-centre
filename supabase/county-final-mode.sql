alter table public.upcoming_fixtures
  add column if not exists county_final_mode boolean not null default false,
  add column if not exists road_to_final text;

alter table public.matches
  add column if not exists county_final_mode boolean not null default false,
  add column if not exists road_to_final text;

