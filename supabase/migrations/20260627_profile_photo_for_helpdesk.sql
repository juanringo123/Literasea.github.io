alter table public.profiles
  add column if not exists foto_url text;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);

drop policy if exists profiles_update_own_photo on public.profiles;
create policy profiles_update_own_photo
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
