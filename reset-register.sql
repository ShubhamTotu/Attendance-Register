delete from public.attendance_entries
where lower(handle) not in ('@shubhamtotu', '@toly');

insert into public.attendance_entries (handle, status)
values
  ('@shubhamtotu', 'present'),
  ('@toly', 'present')
on conflict ((lower(handle))) do update
set
  handle = excluded.handle,
  status = excluded.status;
