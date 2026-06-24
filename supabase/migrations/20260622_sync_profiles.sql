-- Supabase migration:
-- 1) backfill semua user Auth yang belum punya baris di public.profiles
-- 2) bikin trigger supaya setiap user baru otomatis masuk profiles
--
-- Jalankan sekali di Supabase SQL Editor / migration pipeline.

create extension if not exists pgcrypto;

update public.profiles
set member_id = 'LIT-' || upper(left(replace(id::text, '-', ''), 6))
where member_id is null or member_id = '';

insert into public.profiles (
  id,
  email,
  full_name,
  phone,
  member_id,
  tanggal_lahir
)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1)
  ),
  nullif(u.raw_user_meta_data ->> 'phone', ''),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'member_id', ''),
    'LIT-' || upper(left(replace(u.id::text, '-', ''), 6))
  ),
  coalesce(nullif(u.raw_user_meta_data ->> 'tanggal_lahir', ''), '-')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    member_id,
    tanggal_lahir
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'member_id', ''),
      'LIT-' || upper(left(replace(new.id::text, '-', ''), 6))
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'tanggal_lahir', ''), '-')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(profiles.full_name, ''), excluded.full_name),
    phone = coalesce(nullif(profiles.phone, ''), excluded.phone),
    member_id = coalesce(nullif(profiles.member_id, ''), excluded.member_id),
    tanggal_lahir = coalesce(nullif(profiles.tanggal_lahir, ''), excluded.tanggal_lahir);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();
