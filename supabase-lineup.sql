alter table public.matches
add column if not exists soh_lineup jsonb;

comment on column public.matches.soh_lineup is
'Ballinamore SOH match lineup stored as starters and substitutes arrays.';
