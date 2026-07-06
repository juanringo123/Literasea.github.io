-- Repair live Supabase projects where fine payment status is missing
-- or PostgREST still serves an old schema cache.
alter table public.peminjaman
  add column if not exists status_pembayaran_denda text not null default 'belum_dibayar';

update public.peminjaman
set denda = 0
where coalesce(denda, 0) < 0;

update public.peminjaman
set status_pembayaran_denda = case
  when status_pembayaran_denda in ('belum_dibayar', 'menunggu_verifikasi', 'lunas') then status_pembayaran_denda
  when coalesce(denda, 0) > 0 and coalesce(status, '') = 'dikembalikan' then 'lunas'
  when coalesce(denda, 0) > 0 then 'belum_dibayar'
  else 'belum_dibayar'
end;

alter table public.peminjaman
  drop constraint if exists peminjaman_status_pembayaran_denda_check;

alter table public.peminjaman
  add constraint peminjaman_status_pembayaran_denda_check
  check (status_pembayaran_denda in ('belum_dibayar', 'menunggu_verifikasi', 'lunas'));

alter table public.peminjaman
  drop constraint if exists peminjaman_fine_status_requires_amount_check;

alter table public.peminjaman
  add constraint peminjaman_fine_status_requires_amount_check
  check (
    coalesce(denda, 0) > 0
    or status_pembayaran_denda = 'belum_dibayar'
  );

notify pgrst, 'reload schema';
