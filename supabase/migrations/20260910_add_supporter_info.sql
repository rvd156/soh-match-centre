alter table public.upcoming_fixtures
  add column if not exists supporter_info text;

alter table public.upcoming_fixtures
  drop constraint if exists upcoming_fixtures_supporter_info_length;

alter table public.upcoming_fixtures
  add constraint upcoming_fixtures_supporter_info_length
  check (supporter_info is null or char_length(supporter_info) <= 280);
