create table if not exists public.attendance_entries (
  id bigint generated always as identity primary key,
  handle text not null,
  status text not null,
  x_user_id text,
  created_at timestamptz not null default now()
);

alter table public.attendance_entries
add column if not exists x_user_id text;

update public.attendance_entries
set status = 'stuck'
where status in ('retarded', 'broken');

alter table public.attendance_entries
drop constraint if exists attendance_entries_status_check;

alter table public.attendance_entries
add constraint attendance_entries_status_check
check (status in ('present', 'stuck'));

create unique index if not exists attendance_entries_handle_lower_unique
on public.attendance_entries ((lower(handle)));

create unique index if not exists attendance_entries_x_user_id_unique
on public.attendance_entries (x_user_id)
where x_user_id is not null;

create table if not exists public.x_auth_sessions (
  session_token text primary key,
  x_user_id text not null,
  username text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists x_auth_sessions_x_user_id_idx
on public.x_auth_sessions (x_user_id);

create index if not exists x_auth_sessions_expires_at_idx
on public.x_auth_sessions (expires_at);

alter table public.attendance_entries enable row level security;
alter table public.x_auth_sessions enable row level security;

grant usage on schema public to anon;
grant select on public.attendance_entries to anon;
revoke insert on public.attendance_entries from anon;
grant usage, select on sequence public.attendance_entries_id_seq to anon;

drop policy if exists "Public can read attendance entries" on public.attendance_entries;
create policy "Public can read attendance entries"
on public.attendance_entries
for select
to anon
using (true);

drop policy if exists "Public can insert attendance entries" on public.attendance_entries;
