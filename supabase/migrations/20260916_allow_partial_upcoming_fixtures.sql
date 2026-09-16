alter table public.upcoming_fixtures
  alter column match_date drop not null,
  alter column throw_in drop not null;
