create extension if not exists pgcrypto;

create table if not exists public.buku (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  penulis text not null,
  isbn text,
  penerbit text,
  kategori text not null,
  stok integer not null default 0,
  cover_url text,
  deskripsi text,
  created_at timestamptz not null default now()
);

alter table public.buku enable row level security;

drop policy if exists "buku_select_authenticated" on public.buku;
create policy "buku_select_authenticated"
on public.buku
for select
to authenticated
using (true);

drop policy if exists "buku_write_admin" on public.buku;
create policy "buku_write_admin"
on public.buku
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);
