create extension if not exists pgcrypto;

create table if not exists public.peminjaman (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  buku_id text not null,
  judul_buku text,
  nama_anggota text,
  tanggal_pinjam date not null,
  tanggal_kembali date,
  durasi_hari integer,
  status text not null default 'menunggu',
  catatan text,
  denda integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.peminjaman
  add column if not exists judul_buku text,
  add column if not exists nama_anggota text,
  add column if not exists tanggal_pinjam date,
  add column if not exists tanggal_kembali date,
  add column if not exists durasi_hari integer,
  add column if not exists status text,
  add column if not exists catatan text,
  add column if not exists denda integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

update public.peminjaman
set denda = coalesce(denda, 0)
where denda is null;

alter table public.peminjaman
  alter column denda set default 0;

update public.peminjaman p
set judul_buku = coalesce(
  nullif(p.judul_buku, ''),
  nullif(
    coalesce(
      to_jsonb(b)->>'judul',
      to_jsonb(b)->>'Judul',
      to_jsonb(b)->>'judul_buku',
      to_jsonb(b)->>'Judul Buku',
      to_jsonb(b)->>'book_title',
      to_jsonb(b)->>'Book Title',
      to_jsonb(b)->>'title',
      to_jsonb(b)->>'Title',
      to_jsonb(b)->>'nama_buku',
      to_jsonb(b)->>'Nama Buku',
      to_jsonb(b)->>'name',
      to_jsonb(b)->>'Name'
    ),
    ''
  )
)
from public.buku b
where p.buku_id::text = coalesce(
  nullif(to_jsonb(b)->>'id', ''),
  nullif(to_jsonb(b)->>'book_id', ''),
  nullif(to_jsonb(b)->>'kode_buku', ''),
  nullif(to_jsonb(b)->>'kode', ''),
  nullif(to_jsonb(b)->>'book_uuid', '')
)
  and (p.judul_buku is null or p.judul_buku = '');

update public.peminjaman p
set nama_anggota = coalesce(
  nullif(p.nama_anggota, ''),
  pr.full_name,
  pr.email
)
from public.profiles pr
where p.user_id = pr.id
  and (p.nama_anggota is null or p.nama_anggota = '');

alter table public.peminjaman enable row level security;

drop policy if exists peminjaman_select_policy on public.peminjaman;
create policy peminjaman_select_policy
on public.peminjaman
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);

drop policy if exists peminjaman_insert_policy on public.peminjaman;
create policy peminjaman_insert_policy
on public.peminjaman
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);

drop policy if exists peminjaman_update_policy on public.peminjaman;
create policy peminjaman_update_policy
on public.peminjaman
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);
