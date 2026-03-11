create table if not exists public.attendance_entries (
  id bigint generated always as identity primary key,
  handle text not null,
  status text not null check (status in ('present', 'retarded')),
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_entries_handle_lower_unique
on public.attendance_entries ((lower(handle)));

alter table public.attendance_entries enable row level security;

grant usage on schema public to anon;
grant select, insert on public.attendance_entries to anon;
grant usage, select on sequence public.attendance_entries_id_seq to anon;

drop policy if exists "Public can read attendance entries" on public.attendance_entries;
create policy "Public can read attendance entries"
on public.attendance_entries
for select
to anon
using (true);

drop policy if exists "Public can insert attendance entries" on public.attendance_entries;
create policy "Public can insert attendance entries"
on public.attendance_entries
for insert
to anon
with check (
  handle ~ '^@[A-Za-z0-9_]{1,15}$'
  and status in ('present', 'retarded')
);
