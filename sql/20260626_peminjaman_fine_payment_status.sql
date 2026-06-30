alter table public.peminjaman
  add column if not exists status_pembayaran_denda text not null default 'belum_dibayar';

update public.peminjaman
set status_pembayaran_denda = case
  when coalesce(status_pembayaran_denda, '') in ('belum_dibayar', 'menunggu_verifikasi', 'lunas') then status_pembayaran_denda
  when coalesce(denda, 0) > 0 and coalesce(status, '') = 'dikembalikan' then 'lunas'
  when coalesce(denda, 0) > 0 then 'belum_dibayar'
  else 'belum_dibayar'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'peminjaman_status_pembayaran_denda_check'
  ) then
    alter table public.peminjaman
      add constraint peminjaman_status_pembayaran_denda_check
      check (status_pembayaran_denda in ('belum_dibayar', 'menunggu_verifikasi', 'lunas'));
  end if;
end
$$;
