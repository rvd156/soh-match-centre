alter table public.matches
add column if not exists notifications_enabled boolean not null default true;

comment on column public.matches.notifications_enabled is
'Controls whether push notifications may be sent for this match.';
